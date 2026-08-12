import {
  toAnnotations,
  toFirstCoding,
  toImmunizationExplanation,
  toList,
  toMedicationChoice,
  toNotDoneStatus,
  toPerformerList,
  toPositiveInt,
  toProtocolApplied,
  toReferenceList,
  toRequesterReference,
} from './converters';
import type { FieldMigration, MigrationTable } from './types';

export const FHIR_VERSION = {
  STU3: 'STU3',
  R4: 'R4',
  R5: 'R5',
} as const;

/** The name of the built-in post-parse stage, so callers can replace it. */
export const VERSION_TRANSFORM_NAME = 'normalize-to-r4';

/** Resource types renamed between releases. */
export const RESOURCE_TYPE_RENAME: Readonly<Record<string, string>> = {
  Sequence: 'MolecularSequence',
};

/**
 * `encounter` was called `context` across STU3 clinical resources. Same
 * migration, several resource types — declared once and reused rather than
 * retyped per row.
 */
const contextToEncounter: FieldMigration = {
  from: FHIR_VERSION.STU3,
  source: 'context',
  target: 'encounter',
  reason: 'STU3 "context" also allowed EpisodeOfCare, which R4 "encounter" does not.',
};

/**
 * STU3 recorded when a clinician asserted something in `assertedDate`; R4 calls
 * the same instant `recordedDate`. Identical on Condition and
 * AllergyIntolerance.
 */
/**
 * STU3 `definition` is a `Reference`; R4 replaced it with
 * `instantiatesCanonical` (a canonical URL) and `instantiatesUri`. A relative
 * reference like `ActivityDefinition/x` is not a canonical URL, and inventing
 * one would be a guess written into clinical data, so this is reported rather
 * than converted.
 */
const definitionDropped: FieldMigration = {
  from: FHIR_VERSION.STU3,
  source: 'definition',
  reason:
    'R4 replaced it with instantiatesCanonical, which needs a canonical URL rather than a reference.',
};

const assertedToRecorded: FieldMigration = {
  from: FHIR_VERSION.STU3,
  source: 'assertedDate',
  target: 'recordedDate',
};

/**
 * Curated, not exhaustive.
 *
 * Every row is a documented difference between a release and R4. It is
 * deliberately conservative: a wrong migration silently corrupts clinical
 * data, so a difference we are not sure about is better left alone and
 * visible than guessed at. Extend it as real payloads expose gaps.
 */
export const VERSION_MIGRATION: MigrationTable = {
  Observation: [
    contextToEncounter,
    {
      from: FHIR_VERSION.STU3,
      source: 'comment',
      target: 'note',
      convert: toAnnotations,
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'valueAttachment',
      reason: 'R4 removed Attachment from Observation.value[x].',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'related',
      target: 'hasMember',
      convert: toReferenceList,
      reason:
        'R4 splits STU3 "related" into "hasMember" and "derivedFrom"; the relationship type was dropped and every target was mapped to "hasMember".',
    },
  ],
  Condition: [
    contextToEncounter,
    assertedToRecorded,
    {
      from: FHIR_VERSION.STU3,
      source: 'abatementBoolean',
      reason:
        'R4 removed boolean from abatement[x]; there is no element to carry "resolved" alone.',
    },
  ],
  AllergyIntolerance: [assertedToRecorded],
  Procedure: [
    contextToEncounter,
    {
      from: FHIR_VERSION.STU3,
      source: 'notDoneReason',
      target: 'statusReason',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'notDone',
      rewrite: toNotDoneStatus,
      reason: 'R4 removed the boolean and added "not-done" to the status value set.',
    },
    definitionDropped,
  ],
  Immunization: [
    {
      from: FHIR_VERSION.STU3,
      source: 'date',
      target: 'occurrenceDateTime',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'practitioner',
      target: 'performer',
      convert: toPerformerList,
      reason: 'R4 renamed the backbone to "performer" and its "role" to "function".',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'notGiven',
      rewrite: toNotDoneStatus,
      reason: 'R4 removed the boolean and added "not-done" to the status value set.',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'explanation',
      rewrite: toImmunizationExplanation,
      reason:
        'R4 splits the pair by meaning: "reason" is reasonCode, "reasonNotGiven" is statusReason, which is 0..1 so only the first survives.',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'vaccinationProtocol',
      target: 'protocolApplied',
      convert: toProtocolApplied,
      reason:
        'R4 keeps series, authority, targetDisease and the dose numbers; description, doseStatus and doseStatusReason have no R4 home.',
    },
  ],
  DiagnosticReport: [
    contextToEncounter,
    {
      from: FHIR_VERSION.STU3,
      source: 'codedDiagnosis',
      target: 'conclusionCode',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'image',
      target: 'media',
    },
  ],
  MedicationStatement: [
    // No `context` row: R4 MedicationStatement kept `context` and has no
    // `encounter`, so the rename that applies to its neighbours does not apply
    // here. Checked against the digest rather than assumed from the pattern.
    {
      from: FHIR_VERSION.STU3,
      source: 'taken',
      reason: 'R4 removed the element; adherence was not modelled again until R5.',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'reasonNotTaken',
      reason: 'R4 removed the element along with "taken", which was its only trigger.',
    },
  ],
  Coverage: [
    {
      from: FHIR_VERSION.STU3,
      source: 'sequence',
      target: 'order',
      convert: toPositiveInt,
      reason: 'R4 types the element as positiveInt where STU3 used a string.',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'grouping',
      reason: 'R4 replaced the backbone with the "class" list, which names each value differently.',
    },
  ],
  Communication: [contextToEncounter],
  CarePlan: [contextToEncounter, definitionDropped],
  MedicationRequest: [
    contextToEncounter,
    definitionDropped,
    {
      from: FHIR_VERSION.STU3,
      source: 'requester',
      target: 'requester',
      applies: (value) => isBackboneRequester(value),
      convert: toRequesterReference,
      reason: 'STU3 wrapped the requester in a backbone element; "onBehalfOf" has no R4 home.',
    },
    {
      from: FHIR_VERSION.R5,
      source: 'medication',
      rewrite: toMedicationChoice,
      reason: 'R5 uses a CodeableReference; R4 uses the medication[x] choice pair.',
    },
  ],
  Patient: [
    {
      from: FHIR_VERSION.STU3,
      source: 'animal',
      reason: 'R4 moved veterinary data to an extension.',
    },
  ],
  Encounter: [
    {
      from: FHIR_VERSION.STU3,
      source: 'incomingReferral',
      target: 'basedOn',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'reason',
      target: 'reasonCode',
    },
    {
      from: FHIR_VERSION.R5,
      source: 'actualPeriod',
      target: 'period',
    },
    {
      from: FHIR_VERSION.R5,
      source: 'class',
      // R4 `class` is a single Coding, R5 a CodeableConcept list — the array
      // shape is what tells the two apart.
      applies: (value) => Array.isArray(value),
      target: 'class',
      convert: toFirstCoding,
      reason: 'R4 allows only one class Coding; any additional codings were dropped.',
    },
  ],
  DocumentReference: [
    {
      from: FHIR_VERSION.STU3,
      source: 'indexed',
      target: 'date',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'created',
      reason:
        'R4 kept one timestamp, and "indexed" is the one it maps from; a second would overwrite it.',
    },
    {
      from: FHIR_VERSION.STU3,
      source: 'class',
      target: 'category',
      convert: toList,
    },
  ],
};

const isBackboneRequester = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'agent' in (value as Record<string, unknown>);

export const VERSION_WARNING = {
  RENAMED: (at: string, from: string, source: string, target: string): string =>
    `${at}: ${from} field "${source}" is "${target}" in R4 — migrated.`,
  REWRITTEN: (at: string, from: string, source: string, targets: readonly string[]): string =>
    `${at}: ${from} field "${source}" was restructured for R4 as ${targets.join(', ') || 'nothing'}.`,
  DROPPED: (at: string, from: string, source: string): string =>
    `${at}: ${from} field "${source}" has no R4 equivalent — dropped.`,
  /**
   * Distinct from DROPPED: the field *does* have an R4 equivalent, but this
   * value could not be expressed as one — a `comment` that is not a string,
   * a `class` carrying only text where R4 wants a Coding. Saying "no R4
   * equivalent" would blame the spec for what is a problem with the payload.
   */
  UNCONVERTIBLE: (at: string, from: string, source: string, target: string): string =>
    `${at}: ${from} field "${source}" could not be expressed as R4 "${target}" — dropped.`,
  RESOURCE_RENAMED: (at: string, from: string, to: string): string =>
    `${at}: resource type "${from}" is "${to}" in R4 — renamed.`,
} as const;
