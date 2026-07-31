import {
  toAnnotations,
  toFirstCoding,
  toList,
  toMedicationChoice,
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
      source: 'related',
      target: 'hasMember',
      convert: toReferenceList,
      reason:
        'R4 splits STU3 "related" into "hasMember" and "derivedFrom"; the relationship type was dropped and every target was mapped to "hasMember".',
    },
  ],
  Condition: [contextToEncounter],
  Procedure: [contextToEncounter],
  Communication: [contextToEncounter],
  CarePlan: [contextToEncounter],
  MedicationRequest: [
    contextToEncounter,
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
  RESOURCE_RENAMED: (at: string, from: string, to: string): string =>
    `${at}: resource type "${from}" is "${to}" in R4 — renamed.`,
} as const;
