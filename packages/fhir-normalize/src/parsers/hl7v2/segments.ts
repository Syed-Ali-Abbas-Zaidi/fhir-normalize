import type { WarningLog } from '../../core';
import {
  ACT_CODE_SYSTEM,
  ADMINISTRATIVE_SEX,
  ALLERGY_CRITICALITY,
  ENCOUNTER_CLASS,
  HL7V2_WARNING,
  OBSERVATION_STATUS,
  OBX_VALUE_TYPE,
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
  if (classCode !== undefined) {
    const mapped = ENCOUNTER_CLASS[classCode.toUpperCase()];
    if (mapped === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('PV1-2', classCode));
    else encounter.class = { system: ACT_CODE_SYSTEM, ...mapped };
  }

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
    id: idFrom('observation', value(segment, 3), context.index),
  };

  const statusCode = value(segment, 11);
  if (statusCode !== undefined) {
    const status = OBSERVATION_STATUS[statusCode.toUpperCase()];
    if (status === undefined) warnings.add(HL7V2_WARNING.UNKNOWN_CODE('OBX-11', statusCode));
    put(observation, 'status', status);
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

/** The mappers, keyed by segment id, in the order they should be applied. */
export const SEGMENT_MAPPER: Readonly<
  Record<string, (segment: Segment, context: Context) => Resource>
> = {
  [SEGMENT.PATIENT]: toPatient,
  [SEGMENT.VISIT]: toEncounter,
  [SEGMENT.OBSERVATION]: toObservation,
  [SEGMENT.ALLERGY]: toAllergyIntolerance,
  [SEGMENT.DIAGNOSIS]: toCondition,
};
