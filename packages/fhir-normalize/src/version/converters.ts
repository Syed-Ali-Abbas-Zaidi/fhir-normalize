import { isRecord, type UnknownRecord } from '../core';

/**
 * A converter returns `undefined` when it cannot produce a value conformant
 * with the R4 element it is writing to.
 *
 * The alternative is worse than dropping the field. These run on data from
 * another release, so malformed input is ordinary rather than exotic, and
 * whatever a converter returns is written into the resource unchecked — a
 * number landing in `Observation.note`, which R4 types as `Annotation[]`, is a
 * bundle that claims to be R4 and is not. Returning `undefined` drops the
 * element and turns the warning from "migrated" into "dropped", which is the
 * same bargain the migration table already makes: leave it out, and say so.
 */
type Converted = unknown;

/** An empty array is not valid FHIR JSON, so an empty result is no result. */
const listOrNothing = (items: readonly unknown[]): Converted =>
  items.length === 0 ? undefined : items;

/**
 * STU3 `Observation.comment` is a string; R4 `Observation.note` is
 * `Annotation[]`. A string becomes one Annotation; anything already shaped
 * like an Annotation is kept.
 */
export const toAnnotations = (value: unknown): Converted => {
  const items = Array.isArray(value) ? value : [value];

  return listOrNothing(
    items
      .map((item) => (typeof item === 'string' ? { text: item } : item))
      .filter((item) => isRecord(item)),
  );
};

/**
 * STU3 `Observation.related` is `[{ type, target }]`. R4 splits the concept
 * into `hasMember` and `derivedFrom`, both plain reference lists, so only the
 * targets survive — the `type` discriminator has nowhere to go.
 */
export const toReferenceList = (value: unknown): Converted => {
  const items = Array.isArray(value) ? value : [value];

  return listOrNothing(
    items
      .map((item) => (isRecord(item) ? item.target : undefined))
      // A target that is not itself a Reference cannot go in a Reference list.
      .filter((target) => isRecord(target)),
  );
};

/**
 * R5 `Encounter.class` is `CodeableConcept[]`; R4 is a single `Coding`. Takes
 * the first coding of the first concept.
 *
 * A concept carrying only `text` yields nothing: R4 `Encounter.class` is a
 * Coding, and Coding has no `text` element, so there is nowhere to put it.
 */
export const toFirstCoding = (value: unknown): Converted => {
  const [first] = Array.isArray(value) ? value : [value];
  if (!isRecord(first)) return undefined;

  const { coding } = first;
  if (!Array.isArray(coding)) return undefined;

  const [primary] = coding;
  return isRecord(primary) ? primary : undefined;
};

/**
 * STU3 `MedicationRequest.requester` is a backbone element
 * `{ agent, onBehalfOf }`; R4 flattens it to a single `Reference`.
 *
 * Only reached when `agent` is present — the row's `applies` guard checks for
 * it, since without `agent` there is nothing to flatten to.
 */
export const toRequesterReference = (value: unknown): Converted =>
  isRecord(value) ? value.agent : undefined;

/**
 * R5 `MedicationRequest.medication` is a `CodeableReference`, which R4 splits
 * back into the `medication[x]` choice pair.
 *
 * Returns the fields to merge, so an unusable value yields `{}` — no
 * `medication[x]` at all, reported as restructured into nothing.
 */
export const toMedicationChoice = (value: unknown): UnknownRecord => {
  if (!isRecord(value)) return {};

  const { concept, reference } = value;
  const result: UnknownRecord = {};
  if (isRecord(concept)) result.medicationCodeableConcept = concept;
  if (isRecord(reference)) result.medicationReference = reference;

  return result;
};

/** STU3 `DocumentReference.class` is a single CodeableConcept; R4 `category` is a list. */
export const toList = (value: unknown): Converted =>
  listOrNothing(Array.isArray(value) ? value : [value]);
