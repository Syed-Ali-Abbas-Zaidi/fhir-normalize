import type { FhirResource } from 'fhir/r4';
import { createCollectionBundle, ParseError, SOURCE_FORMAT, type WarningLog } from '../../core';
import { HEADER_SEGMENT, HL7V2_ERROR, HL7V2_WARNING, SEGMENT } from './constants';
import { SEGMENT_MAPPER } from './segments';
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
  let queued = 0;

  const rest = message.segments.flatMap((segment) => {
    if (segment.id === SEGMENT.PATIENT) return [];

    const mapper = SEGMENT_MAPPER[segment.id];
    if (mapper === undefined) return [];

    if (subject === undefined && queued === 0) {
      queued += 1;
      warnings.add(HL7V2_WARNING.NO_PATIENT(segment.id));
    }

    return [mapper(segment, { warnings, subject, index: next(segment.id) })];
  });

  reportUnmapped(message, warnings);

  const resources = [...patients, ...rest];
  if (resources.length === 0) {
    throw new ParseError(SOURCE_FORMAT.HL7V2, HL7V2_ERROR.NO_RESOURCES);
  }

  return createCollectionBundle(resources as unknown as FhirResource[]);
};

export { decodeMessage } from './lexer';
