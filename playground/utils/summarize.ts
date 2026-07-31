import { SUMMARIZED_TYPE, UNKNOWN_RESOURCE_TYPE } from '@/constants';
import type { ResourceSummary, SummaryField, UnknownRecord } from '@/types';
import { asText, firstOf, isPlainObject, prop } from './read';

type Summarizer = (resource: UnknownRecord) => readonly (SummaryField | null)[];

const field = (label: string, value: unknown): SummaryField | null => {
  const text = asText(value);
  return text === null ? null : { label, value: text };
};

/** `given` + `family` from the first HumanName, in reading order. */
const humanName = (value: unknown): string | null => {
  const name = firstOf(value);
  if (!isPlainObject(name)) return null;

  const { given, family } = name;
  const givenText = Array.isArray(given)
    ? given.map(asText).filter(Boolean).join(' ')
    : asText(given);

  return [givenText, asText(family)].filter(Boolean).join(' ').trim() || null;
};

const quantity = (value: unknown): string | null => {
  if (!isPlainObject(value)) return null;

  const amount = asText(value.value);
  if (amount === null) return null;

  return [amount, asText(value.unit)].filter(Boolean).join(' ');
};

/**
 * One summarizer per resource type, looked up rather than switched on. Adding
 * a type is a new entry here and nothing else.
 */
const summarizers: Readonly<Record<string, Summarizer>> = {
  [SUMMARIZED_TYPE.PATIENT]: (resource) => [
    field('Name', humanName(resource.name)),
    field('Gender', resource.gender),
    field('Born', resource.birthDate),
    field('Contact', prop(firstOf(resource.telecom), 'value')),
  ],
  [SUMMARIZED_TYPE.OBSERVATION]: (resource) => [
    field(
      'Measure',
      prop(resource.code, 'text') ?? prop(firstOf(prop(resource.code, 'coding')), 'display'),
    ),
    field('Value', quantity(resource.valueQuantity) ?? asText(resource.valueString)),
    field('Status', resource.status),
    field('When', resource.effectiveDateTime),
    field('Subject', prop(resource.subject, 'reference')),
  ],
  [SUMMARIZED_TYPE.ENCOUNTER]: (resource) => [
    field('Status', resource.status),
    field('Class', prop(resource.class, 'code') ?? prop(resource.class, 'display')),
    field('When', prop(resource.period, 'start')),
  ],
  [SUMMARIZED_TYPE.MEDICATION_REQUEST]: (resource) => [
    field('Medication', prop(resource.medicationCodeableConcept, 'text')),
    field('Status', resource.status),
    field('Intent', resource.intent),
    field('Requester', prop(resource.requester, 'reference')),
  ],
  [SUMMARIZED_TYPE.PRACTITIONER]: (resource) => [
    field('Name', humanName(resource.name)),
    field('Qualification', prop(firstOf(resource.qualification), 'code', 'text')),
  ],
};

/** Fallback for any resource type without a dedicated summarizer. */
const summarizeScalars: Summarizer = (resource) =>
  Object.entries(resource)
    .filter(([key]) => key !== 'resourceType' && key !== 'id')
    .map(([key, value]) => field(key, value));

/**
 * Reduce a canonical resource to a handful of human-readable rows — a preview
 * of the simplified-view layer, and the payoff of having one standard shape.
 */
export const summarize = (resource: unknown, position: number): ResourceSummary => {
  if (!isPlainObject(resource)) {
    return { key: `unknown-${position}`, type: UNKNOWN_RESOURCE_TYPE, fields: [] };
  }

  const type = asText(resource.resourceType) ?? UNKNOWN_RESOURCE_TYPE;
  const summarizer = summarizers[type] ?? summarizeScalars;

  const fields = [...summarizer(resource), field('id', resource.id)].filter(
    (entry): entry is SummaryField => entry !== null,
  );

  return { key: `${type}/${asText(resource.id) ?? position}`, type, fields };
};
