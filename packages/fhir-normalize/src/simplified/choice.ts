import type { UnknownRecord } from '../core';
import { TYPE_SUFFIX_KIND, VALUE_KIND } from './constants';
import {
  toAddress,
  toBoolean,
  toConcept,
  toContactPoint,
  toDateTime,
  toIdentifier,
  toName,
  toNumber,
  toPeriod,
  toPrimitive,
  toQuantity,
  toRange,
  toRatio,
  toReference,
  toString_,
  toUnknown,
} from './datatypes';
import type { NormalizedValue, ValueKind } from './types';

/** Exhaustive over `ValueKind`: a new kind will not compile until handled. */
const byKind: Record<ValueKind, (value: unknown) => NormalizedValue> = {
  [VALUE_KIND.CONCEPT]: toConcept,
  [VALUE_KIND.QUANTITY]: toQuantity,
  [VALUE_KIND.REFERENCE]: toReference,
  [VALUE_KIND.PERIOD]: toPeriod,
  [VALUE_KIND.RANGE]: toRange,
  [VALUE_KIND.RATIO]: toRatio,
  [VALUE_KIND.NAME]: toName,
  [VALUE_KIND.CONTACT]: toContactPoint,
  [VALUE_KIND.ADDRESS]: toAddress,
  [VALUE_KIND.IDENTIFIER]: toIdentifier,
  [VALUE_KIND.STRING]: toString_,
  [VALUE_KIND.BOOLEAN]: toBoolean,
  [VALUE_KIND.NUMBER]: toNumber,
  [VALUE_KIND.DATE_TIME]: toDateTime,
  [VALUE_KIND.UNKNOWN]: toUnknown,
};

export const normalizeByKind = (value: unknown, kind: ValueKind): NormalizedValue =>
  byKind[kind](value);

export interface ResolvedChoice {
  value: NormalizedValue;
  /** The element the value came from, e.g. `valueQuantity`. */
  sourceKey: string;
}

const equalsIgnoreCase = (a: string, b: string): boolean =>
  a.length === b.length && a.toLowerCase() === b.toLowerCase();

/**
 * Whether `key` is `base` carrying a type suffix this choice accepts.
 *
 * Two guards. The suffix must start a type name, or `valueSet` would read as a
 * `value` choice of type `Set`. And when the caller knows which types R4
 * permits, the suffix must be one of them — otherwise a payload from another
 * release lands on the choice and is presented as conformant, which is how R5
 * `Observation.valueReference` came to be read as an R4 `value`.
 */
const suffixOf = (key: string, base: string, permitted?: readonly string[]): string | null => {
  if (!key.startsWith(base) || key.length === base.length) return null;

  const suffix = key.slice(base.length);
  if (suffix[0] !== suffix[0]?.toUpperCase()) return null;
  if (TYPE_SUFFIX_KIND[suffix] === undefined) return null;

  // Compared case-insensitively: the spec writes primitives lowercase
  // (`string`, `dateTime`) but serializes them capitalised (`valueString`).
  if (permitted !== undefined && !permitted.some((type) => equalsIgnoreCase(type, suffix))) {
    return null;
  }

  return suffix;
};

/**
 * Resolve a FHIR choice element such as `value[x]`.
 *
 * FHIR serializes a choice as the base name plus the capitalised type name, so
 * the same clinical fact arrives as `valueQuantity`, `valueCodeableConcept`,
 * `valueString`, and so on. That is the single biggest reason downstream code
 * still branches after the format has been normalized.
 *
 * The type suffix is read from the element name — which the spec guarantees —
 * and the value is normalized to a shape carrying `kind` and `text`. Callers
 * read one key and switch on `kind`, or just print `text`.
 *
 * `permitted` narrows which suffixes count, and should be the types R4 allows
 * for the element. Omitted, any known FHIR type is accepted.
 */
export const resolveChoice = (
  record: UnknownRecord,
  base: string,
  permitted?: readonly string[],
): ResolvedChoice | null => {
  // A non-suffixed element of the same name wins: R5 collapses some choices
  // back into a single element, and an already-simple value needs no decoding.
  if (record[base] !== undefined) {
    return { value: toPrimitive(record[base]), sourceKey: base };
  }

  for (const key of Object.keys(record)) {
    const suffix = suffixOf(key, base, permitted);
    if (suffix === null) continue;

    const kind = TYPE_SUFFIX_KIND[suffix];
    if (kind === undefined) continue;

    return { value: normalizeByKind(record[key], kind), sourceKey: key };
  }

  return null;
};

/** Every element name that {@link resolveChoice} would consume for `base`. */
export const choiceKeys = (
  record: UnknownRecord,
  base: string,
  permitted?: readonly string[],
): string[] =>
  Object.keys(record).filter((key) => key === base || suffixOf(key, base, permitted) !== null);
