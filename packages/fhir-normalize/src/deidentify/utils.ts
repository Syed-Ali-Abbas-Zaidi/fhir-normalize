import type { Bundle, FhirResource } from 'fhir/r4';
import { isRecord, type UnknownRecord } from '../core';
import {
  DATE_PATTERN,
  DATE_POLICY,
  DEFAULT_OPTIONS,
  DEID_ACTION,
  FREE_TEXT_ELEMENT,
  FREE_TEXT_POLICY,
  NEVER_REDACT_ELEMENT,
  REDACT_ELEMENT,
} from './constants';
import { surrogate, surrogateReference } from './surrogate';
import type {
  DeIdentifyOptions,
  DeIdentifyReport,
  DeIdentifyResourceResult,
  DeIdentifyResult,
} from './types';

interface Tally {
  redacted: number;
  pseudonymized: number;
  datesGeneralized: number;
  elements: Set<string>;
}

interface Settings {
  dates: DeIdentifyOptions['dates'];
  freeText: DeIdentifyOptions['freeText'];
  pseudonymizeIds: boolean;
  salt: string;
  keep: ReadonlySet<string>;
}

/**
 * A Reference, identified by structure rather than by position. Its `display`
 * is usually a person's name, unlike `Coding.display` which is vocabulary.
 */
const isReference = (record: UnknownRecord): boolean => typeof record.reference === 'string';

/**
 * An Identifier. `value` is a string here and a number on a Quantity, which is
 * what separates `{ system, value: 'MRN-417' }` from `{ system, value: 74.5 }`.
 */
const isIdentifier = (record: UnknownRecord): boolean =>
  typeof record.value === 'string' &&
  (typeof record.system === 'string' || record.use !== undefined || record.assigner !== undefined);

const generalizeDate = (value: string): string => value.slice(0, 4);

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && DATE_PATTERN.test(value);

/**
 * Walk a value, applying the policy. Returns the replacement, or `undefined`
 * to mean "drop this element".
 */
const scrub = (value: unknown, key: string, settings: Settings, tally: Tally): unknown => {
  if (Array.isArray(value)) {
    const items = value.map((item) => scrub(item, key, settings, tally)).filter(present);
    return items.length === 0 ? undefined : items;
  }

  if (isRecord(value)) return scrubRecord(value, settings, tally);

  if (isDate(value)) {
    if (settings.dates === DATE_POLICY.REDACT) {
      count(tally, 'redacted', key);
      return undefined;
    }
    if (settings.dates === DATE_POLICY.YEAR) {
      count(tally, 'datesGeneralized', key);
      return generalizeDate(value);
    }
  }

  return value;
};

const present = (value: unknown): boolean => value !== undefined;

const count = (tally: Tally, field: keyof Omit<Tally, 'elements'>, element: string): void => {
  tally[field] += 1;
  tally.elements.add(element);
};

/**
 * What to do with one element, decided before anything is written.
 * Discriminated by {@link DEID_ACTION}, the same vocabulary the report uses.
 */
type Decision =
  | { action: typeof DEID_ACTION.KEEP }
  | { action: typeof DEID_ACTION.REDACT; label: string }
  | { action: typeof DEID_ACTION.PSEUDONYMIZE; value: string; label: string }
  | { action: typeof DEID_ACTION.RECURSE };

/** Whether the record this element sits on is a Reference or an Identifier. */
interface Context {
  reference: boolean;
  identifier: boolean;
}

/**
 * Contextual rules come first: the same element name means different things in
 * different datatypes, and a flat name list cannot tell `Coding.display`
 * (vocabulary) from `Reference.display` (usually a person).
 */
const decideContextual = (
  key: string,
  value: unknown,
  context: Context,
  salt: string,
): Decision | null => {
  if (context.reference && key === 'display') {
    return { action: DEID_ACTION.REDACT, label: 'Reference.display' };
  }

  if (typeof value !== 'string') return null;

  if (context.reference && key === 'reference') {
    return {
      action: DEID_ACTION.PSEUDONYMIZE,
      value: surrogateReference(value, salt),
      label: 'Reference.reference',
    };
  }
  if (context.identifier && key === 'value') {
    return {
      action: DEID_ACTION.PSEUDONYMIZE,
      value: surrogate(value, salt),
      label: 'Identifier.value',
    };
  }
  if (key === 'fullUrl') {
    return { action: DEID_ACTION.PSEUDONYMIZE, value: surrogateReference(value, salt), label: key };
  }
  if (key === 'id') {
    return { action: DEID_ACTION.PSEUDONYMIZE, value: surrogate(value, salt), label: key };
  }

  return null;
};

const decide = (key: string, value: unknown, context: Context, settings: Settings): Decision => {
  if (settings.keep.has(key)) return { action: DEID_ACTION.KEEP };

  const contextual = decideContextual(key, value, context, settings.salt);
  if (contextual !== null) return contextual;

  if (!NEVER_REDACT_ELEMENT.has(key) && REDACT_ELEMENT.has(key)) {
    return { action: DEID_ACTION.REDACT, label: key };
  }

  if (FREE_TEXT_ELEMENT.has(key) && settings.freeText === FREE_TEXT_POLICY.REDACT) {
    return { action: DEID_ACTION.REDACT, label: key };
  }

  return { action: DEID_ACTION.RECURSE };
};

const scrubRecord = (record: UnknownRecord, settings: Settings, tally: Tally): UnknownRecord => {
  const result: UnknownRecord = {};
  const context: Context = { reference: isReference(record), identifier: isIdentifier(record) };

  for (const [key, value] of Object.entries(record)) {
    const decision = decide(key, value, context, settings);

    if (decision.action === DEID_ACTION.KEEP) {
      result[key] = value;
      continue;
    }

    if (decision.action === DEID_ACTION.REDACT) {
      count(tally, 'redacted', decision.label);
      continue;
    }

    if (decision.action === DEID_ACTION.PSEUDONYMIZE) {
      // With pseudonymisation off the element goes entirely, which usually
      // breaks the graph — that is the caller's explicit choice.
      if (settings.pseudonymizeIds) {
        result[key] = decision.value;
        count(tally, 'pseudonymized', decision.label);
      } else {
        count(tally, 'redacted', decision.label);
      }
      continue;
    }

    const scrubbed = scrub(value, key, settings, tally);
    if (scrubbed !== undefined) result[key] = scrubbed;
  }

  return result;
};

const settingsFrom = (options: DeIdentifyOptions): Settings => ({
  dates: options.dates ?? DEFAULT_OPTIONS.dates,
  freeText: options.freeText ?? DEFAULT_OPTIONS.freeText,
  pseudonymizeIds: options.pseudonymizeIds ?? DEFAULT_OPTIONS.pseudonymizeIds,
  salt: options.salt ?? DEFAULT_OPTIONS.salt,
  keep: new Set(options.keep ?? DEFAULT_OPTIONS.keep),
});

/**
 * The scrub itself. A Bundle and a bare resource are both just records, so
 * they share one implementation and differ only in what the caller names the
 * result.
 */
const scrubWith = (
  record: UnknownRecord,
  options: DeIdentifyOptions,
): { scrubbed: UnknownRecord; report: DeIdentifyReport } => {
  const tally: Tally = {
    redacted: 0,
    pseudonymized: 0,
    datesGeneralized: 0,
    elements: new Set<string>(),
  };

  const scrubbed = scrubRecord(record, settingsFrom(options), tally);

  return {
    scrubbed,
    report: {
      redacted: tally.redacted,
      pseudonymized: tally.pseudonymized,
      datesGeneralized: tally.datesGeneralized,
      elements: [...tally.elements].sort(),
    },
  };
};

/**
 * Remove direct identifiers from a canonical Bundle.
 *
 * Structural, not semantic: it acts on element names and datatypes, so it
 * cannot find an identifier hiding inside prose. That is why free text is
 * removed by default rather than inspected.
 *
 * The input is not modified — a new Bundle is returned.
 */
export const deIdentifyBundle = (
  bundle: Bundle,
  options: DeIdentifyOptions = {},
): DeIdentifyResult => {
  const { scrubbed, report } = scrubWith(bundle as unknown as UnknownRecord, options);

  return { bundle: scrubbed as unknown as Bundle, report };
};

/**
 * Remove direct identifiers from a single resource.
 *
 * The same pass as {@link deIdentifyBundle}, for callers holding one resource
 * rather than a Bundle — reading an NDJSON export a line at a time, say, where
 * wrapping each resource in a Bundle just to unwrap it again would allocate a
 * container per resource for nothing.
 *
 * `report` covers this resource alone. Summing across a stream is the caller's
 * to do, since only they know where the stream ends.
 *
 * The input is not modified — a new resource is returned.
 */
export const deIdentifyResource = (
  resource: FhirResource,
  options: DeIdentifyOptions = {},
): DeIdentifyResourceResult => {
  const { scrubbed, report } = scrubWith(resource as unknown as UnknownRecord, options);

  return { resource: scrubbed as unknown as FhirResource, report };
};
