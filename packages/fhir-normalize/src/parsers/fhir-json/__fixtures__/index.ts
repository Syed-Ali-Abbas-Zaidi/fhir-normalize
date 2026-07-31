import type { Bundle, Observation, Patient } from 'fhir/r4';

export const patientFixture: Patient = {
  resourceType: 'Patient',
  id: 'example-1',
  name: [{ use: 'official', family: 'Khan', given: ['Ali'] }],
  gender: 'male',
  birthDate: '1996-04-12',
  telecom: [{ system: 'email', value: 'ali@example.com' }],
};

export const observationFixture: Observation = {
  resourceType: 'Observation',
  id: 'obs-weight',
  status: 'final',
  code: {
    text: 'Body Weight',
    coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }],
  },
  subject: { reference: 'Patient/example-1' },
  effectiveDateTime: '2026-07-20T09:30:00Z',
  valueQuantity: {
    value: 74.5,
    unit: 'kg',
    system: 'http://unitsofmeasure.org',
    code: 'kg',
  },
};

export const bundleFixture: Bundle = {
  resourceType: 'Bundle',
  id: 'bundle-1',
  type: 'collection',
  entry: [{ resource: patientFixture }, { resource: observationFixture }],
};

/** A transaction bundle whose entry carries a request instead of a resource. */
export const transactionBundleFixture = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [{ request: { method: 'DELETE', url: 'Patient/example-1' } }],
};
