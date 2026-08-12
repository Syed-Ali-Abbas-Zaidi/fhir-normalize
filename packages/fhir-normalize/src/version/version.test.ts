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

describe('STU3 -> R4, the widened rows', () => {
  it('renames assertedDate on both resources that had it', () => {
    for (const resourceType of ['Condition', 'AllergyIntolerance']) {
      const { resource, warnings } = migrate({
        resourceType,
        id: 'x',
        assertedDate: '2017-04-05',
      });

      expect(resource.recordedDate).toBe('2017-04-05');
      expect(resource).not.toHaveProperty('assertedDate');
      expect(warnings.join()).toContain('"recordedDate"');
    }
  });

  it('turns Procedure.notDone into the R4 status, overwriting the STU3 one', () => {
    /*
     * The dangerous case in this table. A payload saying the procedure did not
     * happen must not arrive in R4 looking like one saying it did — and the
     * STU3 status cannot have said `not-done`, because that code postdates it.
     */
    const { resource } = migrate({
      resourceType: 'Procedure',
      id: 'p1',
      status: 'completed',
      notDone: true,
      notDoneReason: { text: 'patient declined' },
    });

    expect(resource.status).toBe('not-done');
    expect(resource.statusReason).toEqual({ text: 'patient declined' });
    expect(resource).not.toHaveProperty('notDone');
  });

  it('leaves the status alone when notDone is false, and removes the field', () => {
    const { resource } = migrate({
      resourceType: 'Procedure',
      id: 'p2',
      status: 'completed',
      notDone: false,
    });

    expect(resource.status).toBe('completed');
    expect(resource).not.toHaveProperty('notDone');
  });

  it('applies the same treatment to Immunization.notGiven', () => {
    const { resource } = migrate({
      resourceType: 'Immunization',
      id: 'i1',
      status: 'completed',
      notGiven: true,
    });

    expect(resource.status).toBe('not-done');
  });

  it('splits Immunization.explanation by meaning', () => {
    const { resource } = migrate({
      resourceType: 'Immunization',
      id: 'i2',
      status: 'completed',
      explanation: {
        reason: [{ text: 'routine' }],
        reasonNotGiven: [{ text: 'allergy' }, { text: 'ignored, R4 allows one' }],
      },
    });

    expect(resource.reasonCode).toEqual([{ text: 'routine' }]);
    expect(resource.statusReason).toEqual({ text: 'allergy' });
    expect(resource).not.toHaveProperty('explanation');
  });

  it('renames Immunization.practitioner.role to performer.function', () => {
    const { resource } = migrate({
      resourceType: 'Immunization',
      id: 'i3',
      status: 'completed',
      practitioner: [
        { role: { text: 'AP' }, actor: { reference: 'Practitioner/1' } },
        { actor: { reference: 'Practitioner/2' } },
      ],
    });

    expect(resource.performer).toEqual([
      { function: { text: 'AP' }, actor: { reference: 'Practitioner/1' } },
      { actor: { reference: 'Practitioner/2' } },
    ]);
  });

  it('drops a performer with no actor, which R4 requires', () => {
    const { resource, warnings } = migrate({
      resourceType: 'Immunization',
      id: 'i4',
      status: 'completed',
      practitioner: [{ role: { text: 'AP' } }],
    });

    expect(resource).not.toHaveProperty('performer');
    expect(warnings.join()).toContain('could not be expressed');
  });

  it('keeps only what R4 protocolApplied defines, and needs a dose number', () => {
    const { resource } = migrate({
      resourceType: 'Immunization',
      id: 'i5',
      status: 'completed',
      vaccinationProtocol: [
        {
          doseSequence: 2,
          series: 'A',
          description: 'has no R4 home',
          doseStatus: { text: 'also none' },
          seriesDoses: 3,
          targetDisease: [{ text: 'measles' }],
        },
        { description: 'no doseSequence, so not a valid R4 element' },
      ],
    });

    expect(resource.protocolApplied).toEqual([
      {
        doseNumberPositiveInt: 2,
        series: 'A',
        targetDisease: [{ text: 'measles' }],
        seriesDosesPositiveInt: 3,
      },
    ]);
  });

  it('migrates the DiagnosticReport trio', () => {
    const { resource } = migrate({
      resourceType: 'DiagnosticReport',
      id: 'd1',
      status: 'final',
      context: { reference: 'Encounter/1' },
      codedDiagnosis: [{ text: 'pneumonia' }],
      image: [{ comment: 'CXR', link: { reference: 'Media/1' } }],
    });

    expect(resource.encounter).toEqual({ reference: 'Encounter/1' });
    expect(resource.conclusionCode).toEqual([{ text: 'pneumonia' }]);
    expect(resource.media).toEqual([{ comment: 'CXR', link: { reference: 'Media/1' } }]);
  });

  it('types Coverage.sequence as the positiveInt R4 wants', () => {
    expect(migrate({ resourceType: 'Coverage', id: 'c1', sequence: '2' }).resource.order).toBe(2);
    expect(
      migrate({ resourceType: 'Coverage', id: 'c3', sequence: '2147483647' }).resource.order,
    ).toBe(2_147_483_647);
  });

  it('renames Encounter.reason to reasonCode', () => {
    const { resource } = migrate({
      resourceType: 'Encounter',
      id: 'e1',
      status: 'finished',
      reason: [{ text: 'chest pain' }],
    });

    expect(resource.reasonCode).toEqual([{ text: 'chest pain' }]);
    expect(resource).not.toHaveProperty('reason');
  });

  it('refuses a Coverage.sequence that is not a positiveInt', () => {
    // R4 positiveInt is a 32-bit signed integer above zero, so the ceiling is
    // 2,147,483,647 and not Number.MAX_SAFE_INTEGER.
    for (const sequence of ['0', '1a', '', '1.5', '-3', '2147483648']) {
      const { resource, warnings } = migrate({ resourceType: 'Coverage', id: 'c2', sequence });

      expect(resource).not.toHaveProperty('order');
      expect(warnings.join()).toContain('could not be expressed');
    }
  });

  it('reports the elements R4 has nowhere to put, rather than passing them through', () => {
    const cases: [string, object, string][] = [
      ['Observation', { valueAttachment: { url: 'x' } }, 'valueAttachment'],
      ['Condition', { abatementBoolean: true }, 'abatementBoolean'],
      ['MedicationStatement', { taken: 'y' }, 'taken'],
      ['MedicationStatement', { reasonNotTaken: [{ text: 'x' }] }, 'reasonNotTaken'],
      ['DocumentReference', { created: '2017-01-01' }, 'created'],
      ['Procedure', { definition: [{ reference: 'ActivityDefinition/1' }] }, 'definition'],
      ['CarePlan', { definition: [{ reference: 'PlanDefinition/1' }] }, 'definition'],
      ['Coverage', { grouping: { group: 'A' } }, 'grouping'],
    ];

    for (const [resourceType, extra, field] of cases) {
      const { resource, warnings } = migrate({ resourceType, id: 'x', ...extra });

      expect(resource).not.toHaveProperty(field);
      expect(warnings.join()).toContain(field);
    }
  });

  it('leaves MedicationStatement.context alone, because R4 kept it', () => {
    // The neighbouring resources rename `context` to `encounter`. This one
    // must not: R4 MedicationStatement has no `encounter` element at all.
    const { resource } = migrate({
      resourceType: 'MedicationStatement',
      id: 'm1',
      context: { reference: 'Encounter/1' },
    });

    expect(resource.context).toEqual({ reference: 'Encounter/1' });
    expect(resource).not.toHaveProperty('encounter');
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

describe('a value that cannot be expressed in R4 is dropped, not written', () => {
  it.each([
    [
      'Observation.comment that is not a string',
      { resourceType: 'Observation', status: 'final', comment: 42 },
      'note',
    ],
    [
      'Observation.related with no usable targets',
      { resourceType: 'Observation', status: 'final', related: ['nonsense'] },
      'hasMember',
    ],
    [
      'Encounter.class carrying only text',
      { resourceType: 'Encounter', status: 'in-progress', class: [{ text: 'ambulatory' }] },
      'class',
    ],
    [
      'Encounter.class of bare strings',
      { resourceType: 'Encounter', status: 'in-progress', class: ['AMB'] },
      'class',
    ],
  ])('%s leaves no trace in the output', (_label, input, target) => {
    // Writing these through would produce a bundle that claims to be R4 while
    // holding a value R4 does not allow there — a number in Annotation[], an
    // empty array (which FHIR JSON forbids), a Coding carrying `text`.
    const { resource, warnings } = migrate(input);

    expect(resource[target]).toBeUndefined();
    expect(warnings.some((warning) => warning.includes('could not be expressed'))).toBe(true);
  });

  it('names the R4 element it could not reach, rather than blaming the spec', () => {
    const { warnings } = migrate({ resourceType: 'Observation', status: 'final', comment: 42 });

    expect(warnings[0]).toContain('could not be expressed as R4 "note"');
    // `comment` does have an R4 equivalent; this value just was not one.
    expect(warnings[0]).not.toContain('has no R4 equivalent');
  });

  it('still reports a genuinely absent element as having no equivalent', () => {
    const { warnings } = migrate({
      resourceType: 'Patient',
      animal: { species: { text: 'dog' } },
    });

    expect(warnings[0]).toContain('has no R4 equivalent');
  });
});
