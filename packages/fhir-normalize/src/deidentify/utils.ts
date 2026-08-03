import type { Bundle } from 'fhir/r4';
import { isRecord, type UnknownRecord } from '../core';
import {
  DATE_PATTERN,
  DATE_POLICY,
  DEFAULT_OPTIONS,
  FREE_TEXT_ELEMENT,
  FREE_TEXT_POLICY,
  NEVER_REDACT_ELEMENT,
  REDACT_ELEMENT,
} from './constants';
import { surrogate, surrogateReference } from './surrogate';
import type { DeIdentifyOptions, DeIdentifyReport, DeIdentifyResult } from './types';

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

/** What to do with one element, decided before anything is written. */
type Decision =
  | { kind: 'verbatim' }
  | { kind: 'drop'; label: string }
  | { kind: 'surrogate'; value: string; label: string }
  | { kind: 'recurse' };

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
  if (typeof value !== 'string') {
    return context.reference && key === 'display'
      ? { kind: 'drop', label: 'Reference.display' }
      : null;
  }

  if (context.reference && key === 'display') return { kind: 'drop', label: 'Reference.display' };
  if (context.reference && key === 'reference') {
    return {
      kind: 'surrogate',
      value: surrogateReference(value, salt),
      label: 'Reference.reference',
    };
  }
  if (context.identifier && key === 'value') {
    return { kind: 'surrogate', value: surrogate(value, salt), label: 'Identifier.value' };
  }
  if (key === 'fullUrl') {
    return { kind: 'surrogate', value: surrogateReference(value, salt), label: key };
  }
  if (key === 'id') return { kind: 'surrogate', value: surrogate(value, salt), label: key };

  return null;
};

const decide = (key: string, value: unknown, context: Context, settings: Settings): Decision => {
  if (settings.keep.has(key)) return { kind: 'verbatim' };

  const contextual = decideContextual(key, value, context, settings.salt);
  if (contextual !== null) return contextual;

  if (!NEVER_REDACT_ELEMENT.has(key) && REDACT_ELEMENT.has(key)) {
    return { kind: 'drop', label: key };
  }

  if (FREE_TEXT_ELEMENT.has(key) && settings.freeText === FREE_TEXT_POLICY.REDACT) {
    return { kind: 'drop', label: key };
  }

  return { kind: 'recurse' };
};

const scrubRecord = (record: UnknownRecord, settings: Settings, tally: Tally): UnknownRecord => {
  const result: UnknownRecord = {};
  const context: Context = { reference: isReference(record), identifier: isIdentifier(record) };

  for (const [key, value] of Object.entries(record)) {
    const decision = decide(key, value, context, settings);

    if (decision.kind === 'verbatim') {
      result[key] = value;
      continue;
    }

    if (decision.kind === 'drop') {
      count(tally, 'redacted', decision.label);
      continue;
    }

    if (decision.kind === 'surrogate') {
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
  const settings = settingsFrom(options);
  const tally: Tally = {
    redacted: 0,
    pseudonymized: 0,
    datesGeneralized: 0,
    elements: new Set<string>(),
  };

  const scrubbed = scrubRecord(bundle as unknown as UnknownRecord, settings, tally);

  const report: DeIdentifyReport = {
    redacted: tally.redacted,
    pseudonymized: tally.pseudonymized,
    datesGeneralized: tally.datesGeneralized,
    elements: [...tally.elements].sort(),
  };

  return { bundle: scrubbed as unknown as Bundle, report };
};
