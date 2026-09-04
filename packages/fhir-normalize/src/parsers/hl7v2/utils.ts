import type { FhirResource } from 'fhir/r4';
import { createCollectionBundle, ParseError, SOURCE_FORMAT, type WarningLog } from '../../core';
import { HEADER_SEGMENT, HL7V2_ERROR, HL7V2_WARNING, SEGMENT } from './constants';
import { REQUIRES_PATIENT, SEGMENT_MAPPER } from './segments';
import type { Message } from './types';

/**
 * The PID that everything else in the message hangs off.
 *
 * A v2 message describes one patient's event, so the first PID is the subject
 * of every observation, diagnosis and allergy in it. Messages with several
 * PIDs exist and are out of scope; the extra patients are still emitted, but
 * only the first is referenced.
 */
const subjectOf = (resources: readonly Record<string, unknown>[]): string | undefined => {
  const patient = resources.find((resource) => resource.resourceType === 'Patient');

  return typeof patient?.id === 'string' ? `Patient/${patient.id}` : undefined;
};

/**
 * Point a report at one of its results.
 *
 * `DiagnosticReport.result` is a list of references, so the report has to be
 * mutated as its observations are mapped rather than assembled up front. The
 * observation is unchanged: FHIR points from report to result, not back, and
 * inventing a reverse link would be data the message never carried.
 */
const attachResult = (
  report: Record<string, unknown> | undefined,
  observation: Record<string, unknown>,
): void => {
  if (report === undefined || typeof observation.id !== 'string') return;

  const results = Array.isArray(report.result) ? report.result : [];
  report.result = [...results, { reference: `Observation/${observation.id}` }];
};

/** Segments this adapter has no mapper for, reported once per kind. */
const reportUnmapped = (message: Message, warnings: WarningLog): void => {
  const counts = new Map<string, number>();

  for (const segment of message.segments) {
    if (segment.id === HEADER_SEGMENT || segment.id in SEGMENT_MAPPER) continue;
    counts.set(segment.id, (counts.get(segment.id) ?? 0) + 1);
  }

  for (const [id, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    warnings.add(HL7V2_WARNING.UNMAPPED_SEGMENT(id, count));
  }
};

/**
 * Map a decoded message onto a collection Bundle.
 *
 * Two passes, because everything else references the patient and the PID is
 * not guaranteed to be the first segment that maps to anything. The first pass
 * builds the patients, the second builds the rest with the subject in hand.
 *
 * @throws {ParseError} Nothing in the message maps to a resource.
 */
export const toBundle = (message: Message, warnings: WarningLog) => {
  const counts = new Map<string, number>();
  const next = (id: string): number => {
    const index = counts.get(id) ?? 0;
    counts.set(id, index + 1);
    return index;
  };

  const patients = message.segments
    .filter((segment) => segment.id === SEGMENT.PATIENT)
    .map((segment) =>
      SEGMENT_MAPPER[SEGMENT.PATIENT]?.(segment, {
        warnings,
        subject: undefined,
        index: next(SEGMENT.PATIENT),
      }),
    )
    .filter((resource): resource is Record<string, unknown> => resource !== undefined);

  const subject = subjectOf(patients);
  const skipped = new Map<string, number>();
  let reportedNoPatient = false;

  /*
   * The report an OBX belongs to, if any.
   *
   * An ORU is a report with results, and v2 says which by position: the OBX
   * segments after an OBR are that OBR's results, until the next OBR. Nothing
   * in an OBX names its report, so the link can only be made here — a mapper
   * sees one segment and has no idea what preceded it.
   *
   * An OBX with no OBR before it is still emitted, unattached. Lab feeds are
   * not the only thing that carries OBX, and an observation without a report
   * is a real observation.
   */
  let openReport: Record<string, unknown> | undefined;

  const rest = message.segments.flatMap((segment) => {
    if (segment.id === SEGMENT.PATIENT) return [];

    const mapper = SEGMENT_MAPPER[segment.id];
    if (mapper === undefined) return [];

    const needsPatient = REQUIRES_PATIENT[segment.id];
    if (subject === undefined && needsPatient !== undefined) {
      skipped.set(segment.id, (skipped.get(segment.id) ?? 0) + 1);
      return [];
    }

    if (subject === undefined && !reportedNoPatient) {
      reportedNoPatient = true;
      warnings.add(HL7V2_WARNING.NO_PATIENT(segment.id));
    }

    const resource = mapper(segment, { warnings, subject, index: next(segment.id) });

    if (segment.id === SEGMENT.REPORT) openReport = resource;
    if (segment.id === SEGMENT.OBSERVATION) attachResult(openReport, resource);

    return [resource];
  });

  for (const [id, count] of [...skipped].sort(([a], [b]) => (a < b ? -1 : 1))) {
    warnings.add(HL7V2_WARNING.SKIPPED_WITHOUT_PATIENT(id, REQUIRES_PATIENT[id] as string, count));
  }

  reportUnmapped(message, warnings);

  const resources = [...patients, ...rest];
  if (resources.length === 0) {
    throw new ParseError(
      SOURCE_FORMAT.HL7V2,
      skipped.size > 0 ? HL7V2_ERROR.ONLY_WITHOUT_PATIENT : HL7V2_ERROR.NO_RESOURCES,
    );
  }

  return createCollectionBundle(resources as unknown as FhirResource[]);
};

export { decodeMessage } from './lexer';
