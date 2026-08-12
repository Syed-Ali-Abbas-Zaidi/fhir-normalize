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

/**
 * STU3 `Immunization.practitioner` is `[{ role, actor }]`; R4 `performer` is
 * `[{ function, actor }]` — the same idea under a reserved word.
 *
 * An entry without an `actor` is dropped rather than carried: R4 makes
 * `performer.actor` required, so a performer without one is not an R4
 * performer.
 */
export const toPerformerList = (value: unknown): Converted => {
  const items = Array.isArray(value) ? value : [value];

  return listOrNothing(
    items
      .filter((item) => isRecord(item) && isRecord(item.actor))
      .map((item) => {
        const { role, actor } = item as UnknownRecord;
        return isRecord(role) ? { function: role, actor } : { actor };
      }),
  );
};

/**
 * STU3 `Coverage.sequence` is a string; R4 `order` is a `positiveInt`.
 *
 * Anything that is not a whole number above zero yields nothing — writing
 * `"1a"` or `0` into a positiveInt would produce a Bundle that claims to be R4
 * and is not.
 */
export const toPositiveInt = (value: unknown): Converted => {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * STU3 recorded "this did not happen" in a boolean beside the status —
 * `Procedure.notDone`, `Immunization.notGiven`. R4 removed both and added
 * `not-done` to the status value set instead.
 *
 * A dropped field here would be the most dangerous loss in this table: a
 * payload saying a vaccine was *not* given would arrive in R4 looking like one
 * saying it was. So `true` overwrites the status, which is the point — the
 * STU3 status alongside `notGiven: true` cannot have said `not-done`, because
 * that code did not exist yet.
 *
 * `false` adds nothing and removes the field, which is the whole of its
 * meaning in R4: not-done is the presence of a status, not the absence of one.
 */
export const toNotDoneStatus = (value: unknown): UnknownRecord =>
  value === true ? { status: 'not-done' } : {};

/**
 * STU3 `Immunization.explanation` is `{ reason, reasonNotGiven }`. R4 splits
 * the pair by meaning: why it happened is `reasonCode`, why it did not is
 * `statusReason`.
 *
 * `statusReason` is `0..1` in R4 where STU3 allowed a list, so only the first
 * survives.
 */
export const toImmunizationExplanation = (value: unknown): UnknownRecord => {
  if (!isRecord(value)) return {};

  const result: UnknownRecord = {};

  const reason = Array.isArray(value.reason) ? value.reason.filter(isRecord) : [];
  if (reason.length > 0) result.reasonCode = reason;

  const notGiven = Array.isArray(value.reasonNotGiven) ? value.reasonNotGiven.filter(isRecord) : [];
  const [first] = notGiven;
  if (first !== undefined) result.statusReason = first;

  return result;
};

/**
 * STU3 `Immunization.vaccinationProtocol` becomes R4 `protocolApplied`, which
 * keeps a subset under different names: `doseSequence` is `doseNumber[x]`, and
 * `description`, `doseStatus` and `doseStatusReason` have no R4 home.
 *
 * R4 makes `doseNumber[x]` **required**, so an entry without a usable
 * `doseSequence` is dropped instead of being emitted as an invalid element —
 * the same rule the rest of this file follows.
 */
export const toProtocolApplied = (value: unknown): Converted => {
  const items = Array.isArray(value) ? value : [value];

  return listOrNothing(
    items.filter(isRecord).flatMap((item) => {
      const doseNumber = toPositiveInt(item.doseSequence);
      if (doseNumber === undefined) return [];

      const applied: UnknownRecord = { doseNumberPositiveInt: doseNumber };
      if (typeof item.series === 'string') applied.series = item.series;
      if (isRecord(item.authority)) applied.authority = item.authority;
      if (Array.isArray(item.targetDisease)) {
        const diseases = item.targetDisease.filter(isRecord);
        if (diseases.length > 0) applied.targetDisease = diseases;
      }

      const seriesDoses = toPositiveInt(item.seriesDoses);
      if (seriesDoses !== undefined) applied.seriesDosesPositiveInt = seriesDoses;

      return [applied];
    }),
  );
};
