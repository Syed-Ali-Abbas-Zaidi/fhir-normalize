import type { WarningLog } from '../../core';
import {
  ACT_CODE_SYSTEM,
  ADMINISTRATIVE_SEX,
  ALLERGY_CRITICALITY,
  ENCOUNTER_CLASS,
  HL7V2_WARNING,
  NULL_FLAVOR_SYSTEM,
  OBSERVATION_STATUS,
  OBX_VALUE_TYPE,
  REPORT_STATUS,
  SEGMENT,
} from './constants';
import {
  listOrNothing,
  toAddress,
  toCodeableConcept,
  toContactPoint,
  toDate,
  toDateTime,
  toHumanName,
  toIdentifier,
} from './datatypes';
import { repetitions, value } from './lexer';
import type { Segment } from './types';

/** Everything a segment mapper needs beyond the segment itself. */
export interface Context {
  readonly warnings: WarningLog;
  /** `Patient/<id>`, or undefined when the message carried no PID. */
  readonly subject: string | undefined;
  /** Position among segments of the same kind, for generating a stable id. */
  readonly index: number;
}

type Resource = Record<string, unknown>;

/** Assigns only what has a value, so no element is written as `undefined`. */
const put = (target: Resource, key: string, item: unknown): void => {
  if (item !== undefined) target[key] = item;
};

const reference = (subject: string | undefined): Resource | undefined =>
  subject === undefined ? undefined : { reference: subject };

/**
 * Ids are derived, never random.
 *
 * The same message parsed twice must produce the same Bundle, which rules out
 * a counter seeded elsewhere or anything time-based. A segment's own
 * identifier is used where it has one, and its position where it does not.
 */
const idFrom = (prefix: string, identifier: string | undefined, index: number): string =>
  `${prefix}-${(identifier ?? String(index + 1)).replace(/[^A-Za-z0-9.-]/g, '')}`.slice(0, 64);

/** PID — the patient. */
const toPatient = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;
  const identifiers = listOrNothing(repetitions(segment, 3).map(toIdentifier));

  const patient: Resource = {
    resourceType: 'Patient',
    id: idFrom('patient', value(segment, 3), context.index),
  };

  put(patient, 'identifier', identifiers);
  put(patient, 'name', listOrNothing(repetitions(segment, 5).map(toHumanName)));
  put(patient, 'birthDate', toDate(value(segment, 7), 'PID-7', warnings));

  const sex = value(segment, 8);
  if (sex !== undefined) {
    const gender = ADMINISTRATIVE_SEX[sex.toUpperCase()];
    if (gender === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('PID-8', sex));
    put(patient, 'gender', gender);
  }

  put(patient, 'address', listOrNothing(repetitions(segment, 11).map(toAddress)));
  put(
    patient,
    'telecom',
    listOrNothing([
      ...repetitions(segment, 13).map((item) => toContactPoint(item, 'home')),
      ...repetitions(segment, 14).map((item) => toContactPoint(item, 'work')),
    ]),
  );
  put(patient, 'maritalStatus', toCodeableConcept(repetitions(segment, 16)[0]));

  // PID-30 is the flag and PID-29 the instant. A date is the better answer
  // when both are present, because it says more.
  const deceasedDate = toDateTime(value(segment, 29), 'PID-29', warnings);
  if (deceasedDate !== undefined) patient.deceasedDateTime = deceasedDate;
  else if (value(segment, 30) === 'Y') patient.deceasedBoolean = true;

  return patient;
};

/** PV1 — the visit. */
const toEncounter = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  const encounter: Resource = {
    resourceType: 'Encounter',
    id: idFrom('encounter', value(segment, 19), context.index),
    // R4 requires a status and PV1 has no field that means one. `unknown` is
    // the honest answer; inventing `finished` would assert something the
    // message never said.
    status: 'unknown',
  };

  const classCode = value(segment, 2);
  const mapped = classCode === undefined ? undefined : ENCOUNTER_CLASS[classCode.toUpperCase()];
  if (classCode !== undefined && mapped === undefined) {
    warnings.add(HL7V2_WARNING.UNKNOWN_CODE('PV1-2', classCode));
  }

  // `class` is required, so an absent or unrecognised PV1-2 gets the null
  // flavour FHIR provides for exactly this, rather than leaving the element
  // out and shipping an Encounter that is not R4.
  encounter.class =
    mapped === undefined
      ? { system: NULL_FLAVOR_SYSTEM, code: 'UNK', display: 'unknown' }
      : { system: ACT_CODE_SYSTEM, ...mapped };

  put(encounter, 'identifier', listOrNothing(repetitions(segment, 19).map(toIdentifier)));
  put(encounter, 'subject', reference(context.subject));
  put(encounter, 'type', listOrNothing([toCodeableConcept(repetitions(segment, 4)[0])]));

  const start = toDateTime(value(segment, 44), 'PV1-44', warnings);
  const end = toDateTime(value(segment, 45), 'PV1-45', warnings);
  if (start !== undefined || end !== undefined) {
    const period: Resource = {};
    put(period, 'start', start);
    put(period, 'end', end);
    encounter.period = period;
  }

  return encounter;
};

/** `OBX-6` is the units, which R4 splits across three Quantity elements. */
const toQuantity = (segment: Segment, parsed: number): Resource => {
  const quantity: Resource = { value: parsed };
  const units = toCodeableConcept(repetitions(segment, 6)[0]);
  const text = typeof units?.text === 'string' ? units.text : undefined;
  const [coding] = Array.isArray(units?.coding) ? (units.coding as Resource[]) : [];
  const code = typeof coding?.code === 'string' ? coding.code : undefined;

  put(quantity, 'unit', text ?? code);
  put(quantity, 'code', code);
  put(quantity, 'system', coding?.system);

  return quantity;
};

const toNumericValue = (segment: Segment, raw: string, warnings: WarningLog): Resource => {
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return { valueQuantity: toQuantity(segment, parsed) };

  // `>100` and `<0.5` are ordinary in a lab feed and are not numbers. Keeping
  // the text beats dropping the result.
  warnings.add(HL7V2_WARNING.UNPARSEABLE_NUMBER('OBX-5', raw));

  return { valueString: raw };
};

const DATE_TYPES: readonly string[] = [
  OBX_VALUE_TYPE.DATE,
  OBX_VALUE_TYPE.DATETIME,
  OBX_VALUE_TYPE.DATETIME_EXTENDED,
];

const CODED_TYPES: readonly string[] = [OBX_VALUE_TYPE.CODED, OBX_VALUE_TYPE.CODED_WITH_EXCEPTIONS];

/** OBX-2 decides which `value[x]` is written, and there is no `valueAny`. */
const observationValue = (segment: Segment, warnings: WarningLog): Resource => {
  const type = (value(segment, 2) ?? '').toUpperCase();
  const raw = value(segment, 5);
  if (raw === undefined) return {};

  if (type === OBX_VALUE_TYPE.NUMERIC) return toNumericValue(segment, raw, warnings);

  if (CODED_TYPES.includes(type)) {
    const concept = toCodeableConcept(repetitions(segment, 5)[0]);
    return concept === undefined ? {} : { valueCodeableConcept: concept };
  }

  if (DATE_TYPES.includes(type)) {
    const when = toDateTime(raw, 'OBX-5', warnings);
    return when === undefined ? {} : { valueDateTime: when };
  }

  return { valueString: raw };
};

/** OBX — one observation. */
const toObservation = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  const observation: Resource = {
    resourceType: 'Observation',
    // OBX-1 is the set id, unique within the message. OBX-3 is the code, and
    // two results of the same test in one message share it — which would give
    // the two observations the same id.
    id: idFrom('observation', value(segment, 1), context.index),
    // R4 requires a status. An OBX with none, or with a code R4 has no
    // counterpart for, still has to say something.
    status: 'unknown',
  };

  const statusCode = value(segment, 11);
  if (statusCode !== undefined) {
    const status = OBSERVATION_STATUS[statusCode.toUpperCase()];
    if (status === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('OBX-11', statusCode));
    else observation.status = status;
  }

  put(observation, 'code', toCodeableConcept(repetitions(segment, 3)[0]));
  put(observation, 'subject', reference(context.subject));
  put(observation, 'effectiveDateTime', toDateTime(value(segment, 14), 'OBX-14', warnings));
  Object.assign(observation, observationValue(segment, warnings));

  const interpretation = toCodeableConcept(repetitions(segment, 8)[0]);
  put(observation, 'interpretation', listOrNothing([interpretation]));

  const low = value(segment, 7);
  if (low !== undefined) observation.referenceRange = [{ text: low }];

  return observation;
};

/** AL1 — one allergy. */
const toAllergyIntolerance = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  const allergy: Resource = {
    resourceType: 'AllergyIntolerance',
    id: idFrom('allergy', value(segment, 1), context.index),
  };

  put(allergy, 'code', toCodeableConcept(repetitions(segment, 3)[0]));
  put(allergy, 'patient', reference(context.subject));

  const severity = value(segment, 4);
  if (severity !== undefined) {
    const criticality = ALLERGY_CRITICALITY[severity.toUpperCase()];
    if (criticality === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('AL1-4', severity));
    put(allergy, 'criticality', criticality);
  }

  const reaction = value(segment, 5);
  if (reaction !== undefined) allergy.reaction = [{ manifestation: [{ text: reaction }] }];

  put(allergy, 'onsetDateTime', toDateTime(value(segment, 6), 'AL1-6', warnings));

  return allergy;
};

/** DG1 — one diagnosis. */
const toCondition = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  const condition: Resource = {
    resourceType: 'Condition',
    id: idFrom('condition', value(segment, 1), context.index),
  };

  put(condition, 'code', toCodeableConcept(repetitions(segment, 3)[0]));
  put(condition, 'subject', reference(context.subject));
  put(condition, 'recordedDate', toDateTime(value(segment, 5), 'DG1-5', warnings));

  return condition;
};

/**
 * OBR — the order a report covers.
 *
 * An ORU is a report *with* results, not a pile of loose observations, and the
 * OBX segments that follow an OBR are its results. `toBundle` does the linking,
 * because grouping is a property of segment order and a mapper only sees one
 * segment.
 */
const toDiagnosticReport = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  const report: Resource = {
    resourceType: 'DiagnosticReport',
    // OBR-3 is the filler order number, the identifier the producing system
    // knows the report by. OBR-1 is only a position within the message.
    id: idFrom('report', value(segment, 3) ?? value(segment, 1), context.index),
    // Required, and an OBR carrying no OBR-25 has not said which.
    status: 'unknown',
    // Required. An OBR without a service identifier is malformed, but a report
    // that omits `code` is not R4 at all, so the element is always written.
    code: toCodeableConcept(repetitions(segment, 4)[0]) ?? {
      text: value(segment, 4) ?? 'Unspecified report',
    },
  };

  const statusCode = value(segment, 25);
  if (statusCode !== undefined) {
    const status = REPORT_STATUS[statusCode.toUpperCase()];
    if (status === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('OBR-25', statusCode));
    else report.status = status;
  }

  // OBR-2 is the placer order number and OBR-3 the filler's; a report is
  // commonly looked up by either.
  put(
    report,
    'identifier',
    listOrNothing([
      ...repetitions(segment, 2).map(toIdentifier),
      ...repetitions(segment, 3).map(toIdentifier),
    ]),
  );
  put(report, 'subject', reference(context.subject));
  put(report, 'effectiveDateTime', toDateTime(value(segment, 7), 'OBR-7', warnings));
  put(report, 'issued', toDateTime(value(segment, 22), 'OBR-22', warnings));

  return report;
};

/** NK1 — a next of kin or emergency contact. */
const toRelatedPerson = (segment: Segment, context: Context): Resource => {
  const related: Resource = {
    resourceType: 'RelatedPerson',
    id: idFrom('related', value(segment, 1), context.index),
    // Required, and the reason NK1 is skipped when the message has no PID.
    patient: reference(context.subject) as Resource,
  };

  put(related, 'name', listOrNothing(repetitions(segment, 2).map(toHumanName)));
  put(related, 'relationship', listOrNothing([toCodeableConcept(repetitions(segment, 3)[0])]));
  put(related, 'address', listOrNothing(repetitions(segment, 4).map(toAddress)));
  put(
    related,
    'telecom',
    listOrNothing([
      ...repetitions(segment, 5).map((item) => toContactPoint(item, 'home')),
      ...repetitions(segment, 6).map((item) => toContactPoint(item, 'work')),
    ]),
  );

  return related;
};

/** IN1 — one insurance policy. */
const toCoverage = (segment: Segment, context: Context): Resource => {
  const { warnings } = context;

  /*
   * R4 requires `payor`, a reference to whoever pays. IN1 names the company
   * without giving it an id, and a Reference carrying only `display` is
   * conformant — inventing an Organization resource to point at would assert a
   * record the message never sent.
   */
  const insurer = value(segment, 4);
  const payor: Resource =
    insurer === undefined ? { display: 'Unspecified payor' } : { display: insurer };

  const coverage: Resource = {
    resourceType: 'Coverage',
    id: idFrom('coverage', value(segment, 2) ?? value(segment, 1), context.index),
    /*
     * Required, and unlike Encounter and Observation this value set has no
     * `unknown` member — it is active | cancelled | draft | entered-in-error.
     * An IN1 in a message describing a current admission is describing cover
     * that applies, so `active` is the reading, and there is no code for
     * declining to say.
     */
    status: 'active',
    beneficiary: reference(context.subject) as Resource,
    payor: [payor],
  };

  put(coverage, 'type', toCodeableConcept(repetitions(segment, 2)[0]));
  put(coverage, 'subscriberId', value(segment, 36));

  const start = toDate(value(segment, 12), 'IN1-12', warnings);
  const end = toDate(value(segment, 13), 'IN1-13', warnings);
  if (start !== undefined || end !== undefined) {
    const period: Resource = {};
    put(period, 'start', start);
    put(period, 'end', end);
    coverage.period = period;
  }

  return coverage;
};

/** The mappers, keyed by segment id, in the order they should be applied. */
/**
 * Segments whose resource R4 will not accept without a patient.
 *
 * `AllergyIntolerance.patient` and `Condition.subject` are both `1..1`, so
 * emitting either from a message with no PID produces a resource that is not
 * R4 — which this library's own validator reports as an error. Those segments
 * are skipped and named instead. `Observation.subject` and `Encounter.subject`
 * are optional, so those still come through, carrying what the message had.
 */
export const REQUIRES_PATIENT: Readonly<Record<string, string>> = {
  [SEGMENT.ALLERGY]: 'AllergyIntolerance',
  [SEGMENT.DIAGNOSIS]: 'Condition',
  [SEGMENT.NEXT_OF_KIN]: 'RelatedPerson',
  [SEGMENT.INSURANCE]: 'Coverage',
};

export const SEGMENT_MAPPER: Readonly<
  Record<string, (segment: Segment, context: Context) => Resource>
> = {
  [SEGMENT.PATIENT]: toPatient,
  [SEGMENT.VISIT]: toEncounter,
  [SEGMENT.REPORT]: toDiagnosticReport,
  [SEGMENT.OBSERVATION]: toObservation,
  [SEGMENT.ALLERGY]: toAllergyIntolerance,
  [SEGMENT.DIAGNOSIS]: toCondition,
  [SEGMENT.NEXT_OF_KIN]: toRelatedPerson,
  [SEGMENT.INSURANCE]: toCoverage,
};
