import { describe, expect, it } from 'vitest';
import { VALIDATION_CODE, VALIDATION_SEVERITY } from './constants';
import { validateBundle, validateResource } from './utils';

/**
 * Structural conformance against base R4, checked from the generated index.
 *
 * Every case here is a payload that triggers exactly one class of problem, so
 * a failure names the rule that broke. The clean case matters as much as the
 * rest: a validator that never returns an empty list is a validator nobody can
 * act on.
 */

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe('validateResource finds each way a payload can be wrong', () => {
  it('reports an element R4 does not define, as a warning', () => {
    // A warning rather than an error: this is where an extension-adjacent
    // field or one from another release lands, and a report full of errors
    // for those is a report nobody reads twice.
    const [issue] = validateResource({
      resourceType: 'Patient',
      gendre: 'female',
    });

    expect(issue?.code).toBe(VALIDATION_CODE.UNKNOWN_ELEMENT);
    expect(issue?.severity).toBe(VALIDATION_SEVERITY.WARNING);
    expect(issue?.path).toBe('Patient.gendre');
  });

  it('reports a repeating element given a single value', () => {
    const issues = validateResource({ resourceType: 'Patient', name: { family: 'Ahmed' } });

    expect(codes(issues)).toContain(VALIDATION_CODE.EXPECTED_LIST);
  });

  it('reports a single element given an array', () => {
    const issues = validateResource({ resourceType: 'Patient', birthDate: ['1991-11-03'] });

    expect(codes(issues)).toContain(VALIDATION_CODE.EXPECTED_SINGLE);
  });

  it('reports an empty array, which is not valid FHIR JSON', () => {
    const issues = validateResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'x' },
      category: [],
    });

    expect(codes(issues)).toContain(VALIDATION_CODE.EMPTY_ARRAY);
  });

  it('reports a required element that is missing', () => {
    const issues = validateResource({ resourceType: 'Observation', code: { text: 'Body Weight' } });
    const missing = issues.filter((i) => i.code === VALIDATION_CODE.MISSING_REQUIRED);

    expect(missing.map((i) => i.path)).toContain('Observation.status');
  });

  it('accepts a required choice under any of its permitted spellings', () => {
    // `MedicationRequest.medication[x]` is required. A choice that is present
    // satisfies it, whichever of its permitted types it arrived as.
    const issues = validateResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      medicationCodeableConcept: { text: 'Amoxicillin' },
    });

    expect(codes(issues)).not.toContain(VALIDATION_CODE.MISSING_REQUIRED);
  });

  it('reports a choice carrying a type R4 forbids, as an error', () => {
    // R4 `Observation.value[x]` permits no Reference. This is a real mistake
    // about a real element, so it outranks a plain unknown element.
    const issues = validateResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'x' },
      valueReference: { reference: 'Observation/o1' },
    });
    const [issue] = issues.filter((i) => i.code === VALIDATION_CODE.DISALLOWED_CHOICE_TYPE);

    expect(issue?.severity).toBe(VALIDATION_SEVERITY.ERROR);
    expect(issue?.path).toBe('Observation.valueReference');
    expect(issue?.message).toContain('Quantity');
  });

  it('does not mistake a same-prefixed element for a choice type', () => {
    // `valueSet` is not `value` of type `Set`. It is simply not an element of
    // Observation, so it is a warning rather than a choice-type error.
    const issues = validateResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'x' },
      valueSet: 'http://example.org/vs',
    });

    expect(codes(issues)).toContain(VALIDATION_CODE.UNKNOWN_ELEMENT);
    expect(codes(issues)).not.toContain(VALIDATION_CODE.DISALLOWED_CHOICE_TYPE);
  });

  it('says so when it cannot check a resource type at all', () => {
    const [issue] = validateResource({ resourceType: 'NutritionProduct', status: 'active' });

    expect(issue?.code).toBe(VALIDATION_CODE.UNKNOWN_RESOURCE_TYPE);
    expect(issue?.severity).toBe(VALIDATION_SEVERITY.WARNING);
  });

  it('finds nothing wrong with a conformant resource', () => {
    expect(
      validateResource({
        resourceType: 'Observation',
        id: 'obs-1',
        meta: { versionId: '1' },
        status: 'final',
        category: [{ coding: [{ code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '29463-7' }], text: 'Body Weight' },
        subject: { reference: 'Patient/p1' },
        effectiveDateTime: '2026-01-01',
        valueQuantity: { value: 74.5, unit: 'kg' },
        note: [{ text: 'Morning round.' }],
      }),
    ).toEqual([]);
  });
});

describe('it descends one level into backbone elements', () => {
  it('reports a bad element inside a backbone, with an indexed path', () => {
    const issues = validateResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Blood pressure' },
      component: [
        { code: { text: 'Systolic' }, valueQuantity: { value: 118, unit: 'mmHg' } },
        { code: { text: 'Diastolic' }, valueNonsense: 76 },
      ],
    });
    const [issue] = issues.filter((i) => i.path.startsWith('Observation.component[1]'));

    expect(issue?.path).toBe('Observation.component[1].valueNonsense');
  });

  it('reports a required element missing from a backbone entry', () => {
    // `Observation.component.code` is required within each component.
    const issues = validateResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Blood pressure' },
      component: [{ valueQuantity: { value: 118, unit: 'mmHg' } }],
    });

    expect(issues.map((i) => i.path)).toContain('Observation.component[0].code');
  });
});

describe('validateBundle says which entry a problem came from', () => {
  it('prefixes the path with the entry index', () => {
    const issues = validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p1' } },
        { resource: { resourceType: 'Patient', id: 'p2', gendre: 'female' } },
      ],
    } as never);

    expect(issues.map((i) => i.path)).toEqual(['Bundle.entry[1].resource.gendre']);
  });

  it('returns nothing for a conformant bundle', () => {
    expect(
      validateBundle({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: { resourceType: 'Patient', id: 'p1', name: [{ family: 'Ahmed' }] } }],
      } as never),
    ).toEqual([]);
  });
});

describe('the elements every resource inherits are checked, not skipped', () => {
  // Absent from the per-resource index, because the shape tables are not asked
  // to declare plumbing. Skipping them by name let a malformed `extension`
  // through, which is the most common repeating element in real FHIR.
  it.each([
    ['extension', { extension: { url: 'http://example.org/x' } }, VALIDATION_CODE.EXPECTED_LIST],
    ['contained', { contained: { resourceType: 'Patient' } }, VALIDATION_CODE.EXPECTED_LIST],
    ['modifierExtension', { modifierExtension: {} }, VALIDATION_CODE.EXPECTED_LIST],
    ['id', { id: ['a', 'b'] }, VALIDATION_CODE.EXPECTED_SINGLE],
    ['meta', { meta: [{ versionId: '1' }] }, VALIDATION_CODE.EXPECTED_SINGLE],
  ])('reports %s given the wrong cardinality', (_label, extra, code) => {
    expect(codes(validateResource({ resourceType: 'Patient', ...extra }))).toContain(code);
  });

  it('accepts them when they are shaped correctly', () => {
    expect(
      validateResource({
        resourceType: 'Patient',
        id: 'p1',
        meta: { versionId: '1' },
        extension: [{ url: 'http://example.org/x', valueString: 'v' }],
        contained: [{ resourceType: 'Practitioner', id: 'pr1' }],
      }),
    ).toEqual([]);
  });

  it('never reports resourceType, which is the discriminator rather than an element', () => {
    expect(codes(validateResource({ resourceType: 'Patient' }))).toEqual([]);
  });
});

describe('validateBundle checks the Bundle itself, not only what is inside it', () => {
  it('reports a Bundle missing its required type', () => {
    const issues = validateBundle({ resourceType: 'Bundle' } as never);

    expect(issues.map((i) => i.path)).toContain('Bundle.type');
  });

  it('reports an element R4 does not give a Bundle', () => {
    const issues = validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      nonsense: 1,
    } as never);

    expect(issues.map((i) => i.path)).toContain('Bundle.nonsense');
  });

  it('reports a non-array entry rather than throwing on it', () => {
    // This used to reach `.flatMap` on an object and raise a TypeError, which
    // is the one thing a function whose job is reporting problems must not do.
    const call = () =>
      validateBundle({
        resourceType: 'Bundle',
        type: 'collection',
        entry: { resource: { resourceType: 'Patient' } },
      } as never);

    expect(call).not.toThrow();
    expect(codes(call())).toContain(VALIDATION_CODE.EXPECTED_LIST);
  });

  it('does not report an entry resource twice', () => {
    // The wrapper pass descends into `entry`, and the per-entry pass validates
    // each resource. `entry.resource` carries no children in the index, so the
    // two do not overlap.
    const issues = validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'Patient', gendre: 'female' } }],
    } as never);

    expect(issues.map((i) => i.path)).toEqual(['Bundle.entry[0].resource.gendre']);
  });
});
