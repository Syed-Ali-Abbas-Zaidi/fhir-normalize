/**
 * Deliberately untyped: these are pre-R4 payloads, so they do not satisfy the
 * R4 interfaces from `fhir/r4` — that mismatch is the whole point.
 */

export const stu3Observation = {
  resourceType: 'Observation',
  id: 'obs-stu3',
  status: 'final',
  code: { text: 'Body Weight' },
  context: { reference: 'Encounter/enc-1' },
  comment: 'Taken after fasting.',
  related: [
    { type: 'has-member', target: { reference: 'Observation/child-1' } },
    { type: 'has-member', target: { reference: 'Observation/child-2' } },
  ],
};

export const stu3Patient = {
  resourceType: 'Patient',
  id: 'pat-stu3',
  gender: 'female',
  animal: { species: { text: 'Canine' } },
};

export const stu3MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'mr-stu3',
  status: 'active',
  context: { reference: 'Encounter/enc-2' },
  requester: {
    agent: { reference: 'Practitioner/dr-1' },
    onBehalfOf: { reference: 'Organization/org-1' },
  },
};

export const stu3DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'doc-stu3',
  indexed: '2017-03-01T10:00:00Z',
  class: { text: 'Discharge summary' },
};

export const stu3Sequence = {
  resourceType: 'Sequence',
  id: 'seq-stu3',
  coordinateSystem: 1,
};

export const r5Encounter = {
  resourceType: 'Encounter',
  id: 'enc-r5',
  status: 'completed',
  class: [{ coding: [{ code: 'AMB', display: 'ambulatory' }] }],
  actualPeriod: { start: '2026-01-01T09:00:00Z' },
};

export const r5MedicationRequestWithConcept = {
  resourceType: 'MedicationRequest',
  id: 'mr-r5-concept',
  status: 'active',
  medication: { concept: { text: 'Amoxicillin 500mg' } },
};

export const r5MedicationRequestWithReference = {
  resourceType: 'MedicationRequest',
  id: 'mr-r5-ref',
  status: 'active',
  medication: { reference: { reference: 'Medication/med-1' } },
};

/** Already R4 — must pass through untouched, with no warnings. */
export const r4Encounter = {
  resourceType: 'Encounter',
  id: 'enc-r4',
  status: 'finished',
  class: { code: 'AMB', display: 'ambulatory' },
  period: { start: '2026-01-01T09:00:00Z' },
};

export const r4Observation = {
  resourceType: 'Observation',
  id: 'obs-r4',
  status: 'final',
  code: { text: 'Body Weight' },
  encounter: { reference: 'Encounter/enc-1' },
  note: [{ text: 'Taken after fasting.' }],
};
