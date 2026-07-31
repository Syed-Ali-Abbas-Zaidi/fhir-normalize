import { isRecord, type UnknownRecord } from '../core';
import { EMPTY_TEXT, VALUE_KIND } from './constants';
import type {
  NormalizedAddress,
  NormalizedBoolean,
  NormalizedCoding,
  NormalizedConcept,
  NormalizedContactPoint,
  NormalizedDateTime,
  NormalizedIdentifier,
  NormalizedName,
  NormalizedNumber,
  NormalizedPeriod,
  NormalizedQuantity,
  NormalizedRange,
  NormalizedRatio,
  NormalizedReference,
  NormalizedString,
  NormalizedUnknown,
  NormalizedValue,
} from './types';

/** A string, or `null` when the value is absent, blank, or not a string. */
export const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const strList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).map(str).filter((item): item is string => item !== null);

/** Joins the parts that are actually present. Never returns an empty string. */
const label = (parts: readonly (string | null)[], separator = ' '): string =>
  parts.filter((part): part is string => part !== null && part !== '').join(separator) ||
  EMPTY_TEXT;

export const toCoding = (value: unknown): NormalizedCoding => {
  const record = isRecord(value) ? value : {};
  return {
    system: str(record.system),
    code: str(record.code),
    display: str(record.display),
  };
};

/**
 * A CodeableConcept or a bare Coding, flattened.
 *
 * `Encounter.class` is a Coding in R4 and a CodeableConcept in R5, and codes
 * arrive with `text`, with `coding[].display`, or with neither. All of those
 * land on the same shape, and `text` is populated from the best available.
 */
export const toConcept = (value: unknown): NormalizedConcept => {
  const record = isRecord(value) ? value : {};
  const raw = Array.isArray(record.coding) ? record.coding : [];
  const codings = raw.map(toCoding);
  const [primary] = codings;

  // A bare Coding has no `coding` array — treat the record itself as one.
  const self = codings.length === 0 ? toCoding(record) : null;
  const chosen = primary ?? self ?? { system: null, code: null, display: null };

  return {
    kind: VALUE_KIND.CONCEPT,
    text: label([str(record.text) ?? chosen.display ?? chosen.code]),
    code: chosen.code,
    system: chosen.system,
    display: chosen.display,
    codings: self === null ? codings : [self],
  };
};

export const toQuantity = (value: unknown): NormalizedQuantity => {
  const record = isRecord(value) ? value : {};
  const amount = num(record.value);
  const unit = str(record.unit) ?? str(record.code);
  const comparator = str(record.comparator);

  return {
    kind: VALUE_KIND.QUANTITY,
    text: label([comparator, amount === null ? null : String(amount), unit]),
    value: amount,
    unit: str(record.unit),
    system: str(record.system),
    code: str(record.code),
    comparator,
  };
};

/** Splits `Patient/pat-1` so callers never parse reference strings themselves. */
export const toReference = (value: unknown): NormalizedReference => {
  const record = isRecord(value) ? value : {};
  const reference = str(record.reference);
  const display = str(record.display);
  const [resourceType = null, id = null] = reference?.split('/').slice(-2) ?? [];
  const hasPair = reference?.includes('/') === true;

  return {
    kind: VALUE_KIND.REFERENCE,
    text: label([display ?? reference ?? str(record.type)]),
    reference,
    resourceType: hasPair ? resourceType : (str(record.type) ?? null),
    id: hasPair ? id : null,
    display,
  };
};

export const toPeriod = (value: unknown): NormalizedPeriod => {
  const record = isRecord(value) ? value : {};
  const start = str(record.start);
  const end = str(record.end);

  return {
    kind: VALUE_KIND.PERIOD,
    text: start === null && end === null ? EMPTY_TEXT : `${start ?? '…'} → ${end ?? '…'}`,
    start,
    end,
  };
};

export const toRange = (value: unknown): NormalizedRange => {
  const record = isRecord(value) ? value : {};
  const low = record.low === undefined ? null : toQuantity(record.low);
  const high = record.high === undefined ? null : toQuantity(record.high);

  return {
    kind: VALUE_KIND.RANGE,
    text: low === null && high === null ? EMPTY_TEXT : `${low?.text ?? '…'} – ${high?.text ?? '…'}`,
    low,
    high,
  };
};

export const toRatio = (value: unknown): NormalizedRatio => {
  const record = isRecord(value) ? value : {};
  const numerator = record.numerator === undefined ? null : toQuantity(record.numerator);
  const denominator = record.denominator === undefined ? null : toQuantity(record.denominator);

  return {
    kind: VALUE_KIND.RATIO,
    text:
      numerator === null && denominator === null
        ? EMPTY_TEXT
        : `${numerator?.text ?? '…'} / ${denominator?.text ?? '…'}`,
    numerator,
    denominator,
  };
};

export const toName = (value: unknown): NormalizedName => {
  const record = isRecord(value) ? value : {};
  const prefix = strList(record.prefix);
  const given = strList(record.given);
  const family = str(record.family);
  const suffix = strList(record.suffix);

  return {
    kind: VALUE_KIND.NAME,
    text: str(record.text) ?? label([...prefix, ...given, family, ...suffix]),
    use: str(record.use),
    prefix,
    given,
    family,
    suffix,
  };
};

export const toContactPoint = (value: unknown): NormalizedContactPoint => {
  const record = isRecord(value) ? value : {};
  const system = str(record.system);
  const contact = str(record.value);

  return {
    kind: VALUE_KIND.CONTACT,
    text: label([system === null ? null : `${system}:`, contact]),
    system,
    value: contact,
    use: str(record.use),
  };
};

export const toAddress = (value: unknown): NormalizedAddress => {
  const record = isRecord(value) ? value : {};
  const line = strList(record.line);
  const city = str(record.city);
  const state = str(record.state);
  const postalCode = str(record.postalCode);
  const country = str(record.country);

  return {
    kind: VALUE_KIND.ADDRESS,
    text: str(record.text) ?? label([...line, city, state, postalCode, country], ', '),
    line,
    city,
    district: str(record.district),
    state,
    postalCode,
    country,
    use: str(record.use),
  };
};

export const toIdentifier = (value: unknown): NormalizedIdentifier => {
  const record = isRecord(value) ? value : {};
  const identifier = str(record.value);

  return {
    kind: VALUE_KIND.IDENTIFIER,
    text: label([identifier]),
    system: str(record.system),
    value: identifier,
    use: str(record.use),
  };
};

/** An Annotation collapses to its text; the author and time stay on the resource. */
export const toAnnotation = (value: unknown): NormalizedString => {
  const record = isRecord(value) ? value : {};
  const text = str(record.text) ?? (typeof value === 'string' ? value : null);

  return { kind: VALUE_KIND.STRING, text: text ?? EMPTY_TEXT, value: text ?? '' };
};

export const toString_ = (value: unknown): NormalizedString => {
  const text = str(value) ?? (value === undefined || value === null ? null : String(value));
  return { kind: VALUE_KIND.STRING, text: text ?? EMPTY_TEXT, value: text ?? '' };
};

export const toBoolean = (value: unknown): NormalizedBoolean => {
  const parsed = value === true || value === 'true';
  return { kind: VALUE_KIND.BOOLEAN, text: String(parsed), value: parsed };
};

export const toNumber = (value: unknown): NormalizedNumber | NormalizedString => {
  const parsed = num(value) ?? num(Number(value));
  if (parsed === null) return toString_(value);
  return { kind: VALUE_KIND.NUMBER, text: String(parsed), value: parsed };
};

export const toDateTime = (value: unknown): NormalizedDateTime | NormalizedString => {
  const text = str(value);
  if (text === null) return toString_(value);
  return { kind: VALUE_KIND.DATE_TIME, text, value: text };
};

export const toUnknown = (value: unknown): NormalizedUnknown => ({
  kind: VALUE_KIND.UNKNOWN,
  text: str(value) ?? EMPTY_TEXT,
  value,
});

/**
 * Falls back to a shape-based reading for a primitive or an undeclared record.
 * Used where the field spec says `PRIMITIVE` but the payload holds an object.
 */
export const toPrimitive = (value: unknown): NormalizedValue => {
  if (typeof value === 'boolean') return toBoolean(value);
  if (typeof value === 'number') return toNumber(value);
  if (typeof value === 'string') return toString_(value);
  if (isRecord(value)) return toUnknown(value as UnknownRecord);
  return toUnknown(value);
};
