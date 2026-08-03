import { describe, expect, it } from 'vitest';
import { FIELD_KIND } from './constants';
import { listShapes } from './describe';
import { CLINICAL_SHAPE, shapeFor } from './shapes';
import type { FieldSpec } from './types';
import { simplifyResource } from './utils';

/**
 * The Clinical section of the FHIR resource list, transcribed from
 * https://build.fhir.org/resourcelist.html on 2026-07-31.
 *
 * Encoded here so coverage is asserted rather than claimed: adding a resource
 * to this list fails the suite until it has a shape.
 */
const CLINICAL_SECTION = {
  Summary: [
    'AllergyIntolerance',
    'AdverseEvent',
    'Condition',
    'Procedure',
    'FamilyMemberHistory',
    'DetectedIssue',
  ],
  Diagnostics: [
    'Observation',
    'DiagnosticReport',
    'Specimen',
    'BodyStructure',
    'ImagingSelection',
    'ImagingStudy',
    'QuestionnaireResponse',
  ],
  Medications: [
    'MedicationRequest',
    'MedicationAdministration',
    'MedicationDispense',
    'MedicationStatement',
    'Medication',
    'Immunization',
  ],
  'Care Provision': [
    'CarePlan',
    'CareTeam',
    'Goal',
    'ServiceRequest',
    'NutritionOrder',
    'NutritionIntake',
    'VisionPrescription',
    'RiskAssessment',
    'RequestOrchestration',
  ],
  'Request & Response': [
    'Communication',
    'CommunicationRequest',
    'DeviceRequest',
    'DeviceAssociation',
    'GuidanceResponse',
  ],
} as const;

/**
 * R4 members of the same section that the current build renamed or dropped.
 * R4 is the canonical target, so these must be covered too.
 */
const R4_ONLY = [
  'ClinicalImpression',
  'Media',
  'MolecularSequence',
  'MedicationKnowledge',
  'ImmunizationEvaluation',
  'ImmunizationRecommendation',
  'RequestGroup',
  'DeviceUseStatement',
  'SupplyRequest',
  'SupplyDelivery',
] as const;

/**
 * The Base section, transcribed from the same page on 2026-08-03.
 */
const BASE_SECTION = {
  Individuals: ['Patient', 'Practitioner', 'PractitionerRole', 'RelatedPerson', 'Person', 'Group'],
  'Entities #1': [
    'Organization',
    'OrganizationAffiliation',
    'HealthcareService',
    'Endpoint',
    'Location',
  ],
  'Entities #2': [
    'Substance',
    'BiologicallyDerivedProduct',
    'Device',
    'DeviceAlert',
    'DeviceMetric',
    'NutritionProduct',
  ],
  Workflow: ['Task', 'Appointment', 'AppointmentResponse', 'Schedule', 'Slot'],
  Management: ['Encounter', 'EpisodeOfCare', 'Flag', 'List', 'Library'],
} as const;

/** R4 member of the Base section that the current build renamed or dropped. */
const BASE_R4_ONLY = ['DeviceDefinition'] as const;

describe('Base section coverage', () => {
  for (const [section, resources] of Object.entries(BASE_SECTION)) {
    it.each(resources)(`${section}: %s has a shape`, (resourceType) => {
      expect(shapeFor(resourceType)).toBeDefined();
    });
  }

  it.each(BASE_R4_ONLY)('R4-only: %s has a shape', (resourceType) => {
    expect(shapeFor(resourceType)).toBeDefined();
  });

  it('covers every listed resource with no gaps', () => {
    const listed = [...Object.values(BASE_SECTION).flat(), ...BASE_R4_ONLY];
    const missing = listed.filter((resourceType) => shapeFor(resourceType) === undefined);

    expect(missing).toEqual([]);
  });
});

describe('Clinical section coverage', () => {
  for (const [section, resources] of Object.entries(CLINICAL_SECTION)) {
    it.each(resources)(`${section}: %s has a shape`, (resourceType) => {
      expect(shapeFor(resourceType)).toBeDefined();
    });
  }

  it.each(R4_ONLY)('R4-only: %s has a shape', (resourceType) => {
    expect(shapeFor(resourceType)).toBeDefined();
  });

  it('covers every listed resource with no gaps', () => {
    const listed = [...Object.values(CLINICAL_SECTION).flat(), ...R4_ONLY];
    const missing = listed.filter((resourceType) => shapeFor(resourceType) === undefined);

    expect(missing).toEqual([]);
  });
});

describe('every declared shape survives real input', () => {
  /**
   * Builds a resource that exercises the shape: one plausible value per
   * declared field, shaped to match the field kind.
   */
  const sampleFor = (resourceType: string): Record<string, unknown> => {
    const shape = shapeFor(resourceType);
    const resource: Record<string, unknown> = { resourceType, id: 'sample-1' };

    for (const [name, spec] of Object.entries(shape?.fields ?? {})) {
      const value = sampleValue(spec);
      if (value !== undefined) resource[name] = spec.list === true ? [value] : value;
    }

    return resource;
  };

  const sampleValue = (spec: FieldSpec): unknown => {
    const byKind: Partial<Record<string, unknown>> = {
      [FIELD_KIND.CONCEPT]: { text: 'Sample', coding: [{ code: 'S', display: 'Sample' }] },
      [FIELD_KIND.REFERENCE]: { reference: 'Patient/p1', display: 'Sample' },
      [FIELD_KIND.QUANTITY]: { value: 1, unit: 'mg' },
      [FIELD_KIND.RATIO]: { numerator: { value: 1, unit: 'mg' }, denominator: { value: 1 } },
      [FIELD_KIND.RANGE]: { low: { value: 1 }, high: { value: 2 } },
      [FIELD_KIND.PERIOD]: { start: '2026-01-01', end: '2026-12-31' },
      [FIELD_KIND.NAME]: { family: 'Sample', given: ['A'] },
      [FIELD_KIND.CONTACT]: { system: 'phone', value: '123' },
      [FIELD_KIND.ADDRESS]: { line: ['1 Road'], city: 'Town' },
      [FIELD_KIND.IDENTIFIER]: { system: 'http://x', value: 'ID-1' },
      [FIELD_KIND.ANNOTATION]: { text: 'A note' },
      [FIELD_KIND.PRIMITIVE]: 'sample',
      [FIELD_KIND.CHOICE]: undefined,
    };

    if (spec.kind === FIELD_KIND.GROUP) {
      const nested: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(spec.fields ?? {})) {
        const value = sampleValue(child);
        if (value !== undefined) nested[name] = child.list === true ? [value] : value;
      }
      return nested;
    }

    return byKind[spec.kind];
  };

  it.each(listShapes())('%s simplifies without throwing, and builds a display', (resourceType) => {
    const simplified = simplifyResource(sampleFor(resourceType));

    expect(simplified.resourceType).toBe(resourceType);
    expect(typeof simplified.display).toBe('string');
    expect(simplified.display.length).toBeGreaterThan(0);
  });

  it.each(listShapes())('%s handles a resource carrying nothing but its type', (resourceType) => {
    const simplified = simplifyResource({ resourceType });

    // With no fields at all the label falls back to the resource type.
    expect(simplified.display).toBe(resourceType);
    expect(simplified.unmapped).toEqual([]);
  });

  it.each(listShapes())('%s resolves its choice elements when present', (resourceType) => {
    const shape = shapeFor(resourceType);
    const choices = Object.entries(shape?.fields ?? {})
      .filter(([, spec]) => spec.kind === FIELD_KIND.CHOICE)
      .map(([name]) => name);

    const resource: Record<string, unknown> = { resourceType };
    for (const name of choices) resource[`${name}String`] = 'sample';

    const { fields } = simplifyResource(resource);

    for (const name of choices) {
      expect(Object.keys(fields), `${resourceType}.${name}`).toContain(name);
    }
  });
});

describe('shape hygiene', () => {
  it.each(Object.entries(CLINICAL_SHAPE))('%s declares at least one field', (_type, shape) => {
    expect(Object.keys(shape.fields).length).toBeGreaterThan(0);
  });

  it('resolves renamed resource types through their alias', () => {
    // R5/R6 renames of R4 resources land on the R4 shape.
    expect(shapeFor('DeviceUsage')).toBe(shapeFor('DeviceUseStatement'));
    expect(shapeFor('DeviceAssociation')).toBe(shapeFor('DeviceUseStatement'));
    expect(shapeFor('RequestOrchestration')).toBe(shapeFor('RequestGroup'));
  });

  it('returns undefined for a resource type with no shape', () => {
    expect(shapeFor('NotARealResource')).toBeUndefined();
  });
});
