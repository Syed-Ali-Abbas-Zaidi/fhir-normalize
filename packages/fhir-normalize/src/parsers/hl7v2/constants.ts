import type { Delimiters } from './types';

/** The segment every message opens with, and the only one whose layout is fixed. */
export const HEADER_SEGMENT = 'MSH';

/**
 * What `|^~\&` means, used only when a message declares nothing else.
 *
 * `MSH-1` and `MSH-2` carry the real values and are read from every message.
 * This exists for the one case where `MSH-2` is absent, which is malformed but
 * common enough to be worth surviving.
 */
export const DEFAULT_DELIMITERS: Delimiters = {
  field: '|',
  component: '^',
  repetition: '~',
  escape: '\\',
  subcomponent: '&',
};

/**
 * The segments this adapter maps, and what each becomes.
 *
 * Deliberately short. The official v2-to-FHIR mapping is an implementation
 * guide of its own; this covers the segments that carry the bulk of an ADT or
 * ORU message, which is what most integrations actually receive.
 */
export const SEGMENT = {
  HEADER: HEADER_SEGMENT,
  PATIENT: 'PID',
  VISIT: 'PV1',
  OBSERVATION: 'OBX',
  ALLERGY: 'AL1',
  DIAGNOSIS: 'DG1',
} as const;

/** `OBX-2`, the value type, decides which `Observation.value[x]` is written. */
export const OBX_VALUE_TYPE = {
  NUMERIC: 'NM',
  STRING: 'ST',
  TEXT: 'TX',
  FORMATTED_TEXT: 'FT',
  CODED: 'CE',
  CODED_WITH_EXCEPTIONS: 'CWE',
  DATE: 'DT',
  DATETIME: 'TS',
  DATETIME_EXTENDED: 'DTM',
  STRUCTURED_NUMERIC: 'SN',
} as const;

/**
 * `OBX-11` to `Observation.status`. Only the codes with an unambiguous R4
 * counterpart; anything else is reported and the observation is left without a
 * status, which validation then reports as the required element it is.
 */
export const OBSERVATION_STATUS: Readonly<Record<string, string>> = {
  C: 'corrected',
  D: 'entered-in-error',
  F: 'final',
  P: 'preliminary',
  R: 'registered',
  W: 'entered-in-error',
  X: 'cancelled',
};

/** `PID-8` to `Patient.gender`. */
export const ADMINISTRATIVE_SEX: Readonly<Record<string, string>> = {
  F: 'female',
  M: 'male',
  O: 'other',
  U: 'unknown',
  A: 'other',
  N: 'other',
};

/** `PV1-2` to `Encounter.class`, which R4 binds to ActCode. */
export const ENCOUNTER_CLASS: Readonly<Record<string, { code: string; display: string }>> = {
  E: { code: 'EMER', display: 'emergency' },
  I: { code: 'IMP', display: 'inpatient encounter' },
  O: { code: 'AMB', display: 'ambulatory' },
  P: { code: 'PRENC', display: 'pre-admission' },
  R: { code: 'AMB', display: 'ambulatory' },
  B: { code: 'OBSENC', display: 'observation encounter' },
};

export const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

/** `AL1-4` to `AllergyIntolerance.criticality`. */
export const ALLERGY_CRITICALITY: Readonly<Record<string, string>> = {
  SV: 'high',
  SEVERE: 'high',
  MO: 'low',
  MODERATE: 'low',
  MI: 'low',
  MILD: 'low',
  U: 'unable-to-assess',
};

export const HL7V2_ERROR = {
  NOT_A_STRING: 'Expected a string containing an HL7 v2 message.',
  NO_HEADER: 'An HL7 v2 message must begin with an MSH segment.',
  NO_SEGMENTS: 'The message contained no segments after the header.',
  NO_RESOURCES:
    'No segment in the message maps to a FHIR resource. Supported segments are PID, PV1, OBX, AL1 and DG1.',
} as const;

export const HL7V2_WARNING = {
  UNMAPPED_SEGMENT: (id: string, count: number): string =>
    `${count} ${id} segment${count === 1 ? '' : 's'} skipped — this adapter maps PID, PV1, OBX, AL1 and DG1 only.`,
  NO_PATIENT: (id: string): string =>
    `${id} has no PID to attach to, so the resource carries no subject.`,
  UNKNOWN_CODE: (at: string, value: string): string =>
    `${at}: "${value}" has no R4 equivalent — left unset.`,
  TIME_DROPPED: (at: string, value: string): string =>
    `${at}: "${value}" carries a time with no UTC offset, which R4 dateTime does not allow — kept as a date.`,
  UNPARSEABLE_DATE: (at: string, value: string): string =>
    `${at}: "${value}" is not an HL7 timestamp — dropped.`,
  UNPARSEABLE_NUMBER: (at: string, value: string): string =>
    `${at}: value type is numeric but "${value}" is not a number — kept as a string.`,
} as const;
