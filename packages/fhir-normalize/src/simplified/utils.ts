import type { Bundle, FhirResource } from 'fhir/r4';
import { isRecord, type UnknownRecord } from '../core';
import { choiceKeys, resolveChoice } from './choice';
import { EMPTY_TEXT, FIELD_KIND, VALUE_KIND } from './constants';
import {
  str,
  toAddress,
  toAnnotation,
  toConcept,
  toContactPoint,
  toIdentifier,
  toName,
  toPeriod,
  toPrimitive,
  toQuantity,
  toRange,
  toRatio,
  toReference,
} from './datatypes';
import { COMMON_ELEMENT, shapeFor } from './shapes';
import type {
  FieldKind,
  FieldSpec,
  NormalizedValue,
  SimplifiedFields,
  SimplifiedResource,
  SimplifiedResourceOf,
} from './types';

/**
 * Single-value normalizers, keyed by field kind. `CHOICE` and `GROUP` are
 * absent because they need the parent record rather than one value.
 */
const byFieldKind: Partial<Record<FieldKind, (value: unknown) => NormalizedValue>> = {
  [FIELD_KIND.CONCEPT]: toConcept,
  [FIELD_KIND.QUANTITY]: toQuantity,
  [FIELD_KIND.RATIO]: toRatio,
  [FIELD_KIND.RANGE]: toRange,
  [FIELD_KIND.REFERENCE]: toReference,
  [FIELD_KIND.PERIOD]: toPeriod,
  [FIELD_KIND.NAME]: toName,
  [FIELD_KIND.CONTACT]: toContactPoint,
  [FIELD_KIND.ADDRESS]: toAddress,
  [FIELD_KIND.IDENTIFIER]: toIdentifier,
  [FIELD_KIND.ANNOTATION]: toAnnotation,
  [FIELD_KIND.PRIMITIVE]: toPrimitive,
};

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

/** Applies one field spec, returning the normalized value and the keys consumed. */
const readField = (
  record: UnknownRecord,
  name: string,
  spec: FieldSpec,
): {
  value: NormalizedValue | NormalizedValue[] | SimplifiedFields[];
  consumed: string[];
} | null => {
  if (spec.kind === FIELD_KIND.CHOICE) {
    const resolved = resolveChoice(record, name, spec.types);
    return resolved === null
      ? null
      : { value: resolved.value, consumed: choiceKeys(record, name, spec.types) };
  }

  const raw = record[name];
  if (raw === undefined || raw === null) return null;

  if (spec.kind === FIELD_KIND.GROUP) {
    const nested = spec.fields ?? {};
    const groups = asList(raw)
      .filter(isRecord)
      .map((item) => readFields(item, nested).fields);
    return groups.length === 0 ? null : { value: groups, consumed: [name] };
  }

  const normalize = byFieldKind[spec.kind] ?? toPrimitive;

  if (spec.list === true) {
    const items = asList(raw).map(normalize);
    return items.length === 0 ? null : { value: items, consumed: [name] };
  }

  // A single-valued spec fed an array takes the first item rather than failing.
  const [single = raw] = Array.isArray(raw) ? raw : [raw];
  return { value: normalize(single), consumed: [name] };
};

const readFields = (
  record: UnknownRecord,
  specs: Readonly<Record<string, FieldSpec>>,
): { fields: SimplifiedFields; consumed: Set<string> } => {
  const fields: SimplifiedFields = {};
  const consumed = new Set<string>();

  for (const [name, spec] of Object.entries(specs)) {
    const read = readField(record, name, spec);
    if (read === null) continue;

    fields[name] = read.value;
    for (const key of read.consumed) consumed.add(key);
  }

  return { fields, consumed };
};

/**
 * Reduce one canonical resource to a predictable shape.
 *
 * Choice elements collapse onto their base name, so `valueQuantity`,
 * `valueString`, and `valueCodeableConcept` all arrive as `value` carrying a
 * `kind` discriminant and a `text` rendering.
 *
 * Nothing is dropped. Elements the shape does not declare are still read, with
 * a generic reading rather than a curated one, and their names are reported in
 * `unmapped` — so an incomplete shape costs fidelity of *interpretation*, never
 * the data itself.
 */
export function simplifyResource<T extends FhirResource>(
  resource: T,
): SimplifiedResourceOf<T['resourceType']>;
export function simplifyResource(resource: unknown): SimplifiedResource;
export function simplifyResource(resource: unknown): SimplifiedResource {
  const record = isRecord(resource) ? resource : {};
  const resourceType = str(record.resourceType) ?? 'Unknown';
  const shape = shapeFor(resourceType);

  const { fields, consumed } = shape
    ? readFields(record, shape.fields)
    : { fields: {} as SimplifiedFields, consumed: new Set<string>() };

  // Anything the shape did not claim is still read generically. With no shape
  // at all there is nothing to be unmapped *from*, so only a declared shape
  // reports gaps.
  const unmapped: string[] = [];
  for (const key of Object.keys(record)) {
    if (consumed.has(key) || COMMON_ELEMENT.has(key)) continue;

    fields[key] = toPrimitive(record[key]);
    if (shape) unmapped.push(key);
  }

  const id = str(record.id);
  const label = shape?.display?.(fields) ?? null;

  return {
    resourceType,
    id,
    display: label ?? id ?? resourceType ?? EMPTY_TEXT,
    fields,
    unmapped,
  };
}

/**
 * Reduce every resource in a canonical Bundle.
 *
 * Pure and side-effect free: it reads the Bundle produced by `parse()` and
 * returns a new structure, leaving the canonical output untouched.
 */
export const simplifyBundle = (bundle: Bundle): SimplifiedResource[] =>
  (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is NonNullable<typeof resource> => resource !== undefined)
    .map(simplifyResource);

export { VALUE_KIND };
