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
 */
export const resolveChoice = (record: UnknownRecord, base: string): ResolvedChoice | null => {
  // A non-suffixed element of the same name wins: R5 collapses some choices
  // back into a single element, and an already-simple value needs no decoding.
  if (record[base] !== undefined) {
    return { value: toPrimitive(record[base]), sourceKey: base };
  }

  for (const key of Object.keys(record)) {
    if (!key.startsWith(base) || key.length === base.length) continue;

    const suffix = key.slice(base.length);
    // The character after the base must start a type name, or `valueSet` would
    // read as a `value` choice of type `Set`.
    if (suffix[0] !== suffix[0]?.toUpperCase()) continue;

    const kind = TYPE_SUFFIX_KIND[suffix];
    if (kind === undefined) continue;

    return { value: normalizeByKind(record[key], kind), sourceKey: key };
  }

  return null;
};

/** Every element name that {@link resolveChoice} would consume for `base`. */
export const choiceKeys = (record: UnknownRecord, base: string): string[] =>
  Object.keys(record).filter((key) => {
    if (key === base) return true;
    if (!key.startsWith(base) || key.length === base.length) return false;
    const suffix = key.slice(base.length);
    return suffix[0] === suffix[0]?.toUpperCase() && TYPE_SUFFIX_KIND[suffix] !== undefined;
  });
