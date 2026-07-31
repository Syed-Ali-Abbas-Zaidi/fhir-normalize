import { isRecord, type UnknownRecord } from '../core';

/** STU3 `Observation.comment` is a string; R4 `Observation.note` is `Annotation[]`. */
export const toAnnotations = (value: unknown): unknown =>
  typeof value === 'string' ? [{ text: value }] : value;

/**
 * STU3 `Observation.related` is `[{ type, target }]`. R4 splits the concept
 * into `hasMember` and `derivedFrom`, both plain reference lists, so only the
 * targets survive — the `type` discriminator has nowhere to go.
 */
export const toReferenceList = (value: unknown): unknown => {
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => (isRecord(item) ? item.target : undefined))
    .filter((target) => target !== undefined);
};

/**
 * R5 `Encounter.class` is `CodeableConcept[]`; R4 is a single `Coding`. Takes
 * the first coding of the first concept.
 */
export const toFirstCoding = (value: unknown): unknown => {
  const [first] = Array.isArray(value) ? value : [value];
  if (!isRecord(first)) return first;

  const { coding } = first;
  if (!Array.isArray(coding)) return first;

  return coding[0];
};

/**
 * STU3 `MedicationRequest.requester` is a backbone element
 * `{ agent, onBehalfOf }`; R4 flattens it to a single `Reference`.
 */
export const toRequesterReference = (value: unknown): unknown =>
  isRecord(value) && value.agent !== undefined ? value.agent : value;

/**
 * R5 `MedicationRequest.medication` is a `CodeableReference`, which R4 splits
 * back into the `medication[x]` choice pair.
 */
export const toMedicationChoice = (value: unknown): UnknownRecord => {
  if (!isRecord(value)) return { medicationCodeableConcept: value };

  const { concept, reference } = value;
  const result: UnknownRecord = {};
  if (concept !== undefined) result.medicationCodeableConcept = concept;
  if (reference !== undefined) result.medicationReference = reference;

  return result;
};

/** STU3 `DocumentReference.class` is a single CodeableConcept; R4 `category` is a list. */
export const toList = (value: unknown): unknown => (Array.isArray(value) ? value : [value]);
