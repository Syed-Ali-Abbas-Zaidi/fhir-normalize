import { describe, expect, it } from 'vitest';
import { CLINICAL_SHAPE, shapeFor } from './shapes';

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
