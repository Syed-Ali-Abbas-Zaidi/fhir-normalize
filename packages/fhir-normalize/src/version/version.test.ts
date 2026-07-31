import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { createCollectionBundle, createParseResult, SOURCE_FORMAT } from '../core';
import {
  r4Encounter,
  r4Observation,
  r5Encounter,
  r5MedicationRequestWithConcept,
  r5MedicationRequestWithReference,
  stu3DocumentReference,
  stu3MedicationRequest,
  stu3Observation,
  stu3Patient,
  stu3Sequence,
} from './__fixtures__';
import { r4VersionTransform, VERSION_TRANSFORM_NAME } from './index';

/** Run a raw resource through the transform and hand back what came out. */
const migrate = (resource: object) => {
  const result = r4VersionTransform.transform(
    createParseResult({
      sourceFormat: SOURCE_FORMAT.FHIR_JSON,
      bundle: createCollectionBundle([resource as never]),
    }),
  );

  return {
    resource: (result.bundle.entry?.[0]?.resource ?? {}) as Record<string, unknown>,
    warnings: result.meta.warnings,
  };
};

describe('r4VersionTransform', () => {
  it('is named so callers can replace it', () => {
    expect(r4VersionTransform.name).toBe(VERSION_TRANSFORM_NAME);
  });

  it('leaves a bundle with no entries alone', () => {
    const bundle = { resourceType: 'Bundle', type: 'collection' } as Bundle;
    const result = r4VersionTransform.transform(
      createParseResult({ sourceFormat: SOURCE_FORMAT.FHIR_JSON, bundle }),
    );

    expect(result.bundle).toBe(bundle);
  });
});

describe('STU3 -> R4', () => {
  it('renames context to encounter', () => {
    const { resource, warnings } = migrate(stu3Observation);

    expect(resource.encounter).toEqual({ reference: 'Encounter/enc-1' });
    expect(resource.context).toBeUndefined();
    expect(warnings.some((w) => w.includes('"context" is "encounter" in R4'))).toBe(true);
  });

  it('converts the comment string into an R4 note annotation list', () => {
    const { resource } = migrate(stu3Observation);

    expect(resource.note).toEqual([{ text: 'Taken after fasting.' }]);
    expect(resource.comment).toBeUndefined();
  });

  it('maps related targets onto hasMember and says the relationship type was lost', () => {
    const { resource, warnings } = migrate(stu3Observation);

    expect(resource.hasMember).toEqual([
      { reference: 'Observation/child-1' },
      { reference: 'Observation/child-2' },
    ]);
    expect(warnings.some((w) => w.includes('relationship type was dropped'))).toBe(true);
  });

  it('drops Patient.animal, which R4 has no home for', () => {
    const { resource, warnings } = migrate(stu3Patient);

    expect(resource.animal).toBeUndefined();
    expect(resource.gender).toBe('female');
    expect(warnings.some((w) => w.includes('"animal" has no R4 equivalent'))).toBe(true);
  });

  it('flattens the backbone requester and flags the lost onBehalfOf', () => {
    const { resource, warnings } = migrate(stu3MedicationRequest);

    expect(resource.requester).toEqual({ reference: 'Practitioner/dr-1' });
    expect(warnings.some((w) => w.includes('"onBehalfOf" has no R4 home'))).toBe(true);
  });

  it('renames DocumentReference.indexed and lifts class into a category list', () => {
    const { resource } = migrate(stu3DocumentReference);

    expect(resource.date).toBe('2017-03-01T10:00:00Z');
    expect(resource.category).toEqual([{ text: 'Discharge summary' }]);
    expect(resource.class).toBeUndefined();
  });

  it('renames the Sequence resource type to MolecularSequence', () => {
    const { resource, warnings } = migrate(stu3Sequence);

    expect(resource.resourceType).toBe('MolecularSequence');
    expect(warnings.some((w) => w.includes('is "MolecularSequence" in R4'))).toBe(true);
  });
});

describe('R5 -> R4', () => {
  it('renames actualPeriod back to period', () => {
    const { resource } = migrate(r5Encounter);

    expect(resource.period).toEqual({ start: '2026-01-01T09:00:00Z' });
    expect(resource.actualPeriod).toBeUndefined();
  });

  it('collapses the class concept list into a single R4 Coding', () => {
    const { resource, warnings } = migrate(r5Encounter);

    expect(resource.class).toEqual({ code: 'AMB', display: 'ambulatory' });
    expect(warnings.some((w) => w.includes('only one class Coding'))).toBe(true);
  });

  it.each([
    ['a concept', r5MedicationRequestWithConcept, 'medicationCodeableConcept'],
    ['a reference', r5MedicationRequestWithReference, 'medicationReference'],
  ])('splits a CodeableReference holding %s into the medication[x] pair', (_l, input, expected) => {
    const { resource } = migrate(input);

    expect(resource[expected]).toBeDefined();
    expect(resource.medication).toBeUndefined();
  });
});

describe('R4 input is left alone', () => {
  it.each([
    ['an Encounter with a Coding class', r4Encounter],
    ['an Observation already using encounter and note', r4Observation],
  ])('does not touch %s', (_label, input) => {
    const { resource, warnings } = migrate(input);

    expect(resource).toEqual(input);
    expect(warnings).toEqual([]);
  });

  it('returns the identical result object when nothing changed', () => {
    const input = createParseResult({
      sourceFormat: SOURCE_FORMAT.FHIR_JSON,
      bundle: createCollectionBundle([r4Observation as never]),
    });

    expect(r4VersionTransform.transform(input)).toBe(input);
  });

  it('does not confuse an R4 Coding class with an R5 concept list', () => {
    const { resource } = migrate(r4Encounter);

    expect(resource.class).toEqual({ code: 'AMB', display: 'ambulatory' });
  });
});

describe('mixed and nested resources', () => {
  it('migrates each resource independently within one bundle', () => {
    const result = r4VersionTransform.transform(
      createParseResult({
        sourceFormat: SOURCE_FORMAT.FHIR_JSON,
        bundle: createCollectionBundle([
          stu3Patient as never,
          r5Encounter as never,
          r4Observation as never,
        ]),
      }),
    );

    const [patient, encounter, observation] = (result.bundle.entry ?? []).map(
      (entry) => entry.resource as unknown as Record<string, unknown>,
    );

    expect(patient?.animal).toBeUndefined();
    expect(encounter?.period).toBeDefined();
    expect(observation).toEqual(r4Observation);
  });

  it('migrates contained resources too', () => {
    const { resource } = migrate({
      resourceType: 'Observation',
      id: 'outer',
      status: 'final',
      contained: [stu3Patient],
    });

    const [contained] = resource.contained as Record<string, unknown>[];

    expect(contained?.animal).toBeUndefined();
  });

  it('identifies the resource by id in every warning', () => {
    const { warnings } = migrate(stu3Patient);

    expect(warnings.every((warning) => warning.startsWith('Patient/pat-stu3:'))).toBe(true);
  });

  it('falls back to a positional label when the resource has no id', () => {
    const { warnings } = migrate({ resourceType: 'Patient', animal: { species: {} } });

    expect(warnings[0]).toMatch(/^Patient \[0\]:/);
  });
});
