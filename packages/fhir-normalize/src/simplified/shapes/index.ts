import type { ResourceShape } from '../types';
import { ADMINISTRATIVE_SHAPE } from './administrative';
import { CLINICAL_ALIAS, CLINICAL_SHAPE } from './clinical';

export { ADMINISTRATIVE_SHAPE } from './administrative';
export { CLINICAL_ALIAS, CLINICAL_SHAPE } from './clinical';

/**
 * Every declared resource shape.
 *
 * The Clinical section of the FHIR resource list is covered in full;
 * administrative resources are included because clinical payloads reference
 * them constantly. A resource type with no shape here still gets its choice
 * elements resolved — it just has no curated field ordering.
 */
export const RESOURCE_SHAPE: Readonly<Record<string, ResourceShape>> = {
  ...ADMINISTRATIVE_SHAPE,
  ...CLINICAL_SHAPE,
};

/** Resolves a resource type through the rename aliases before lookup. */
export const shapeFor = (resourceType: string): ResourceShape | undefined =>
  RESOURCE_SHAPE[resourceType] ?? RESOURCE_SHAPE[CLINICAL_ALIAS[resourceType] ?? ''];

/**
 * Elements every resource may carry. Excluded from `unmapped` so plumbing does
 * not read as a coverage gap.
 */
export const COMMON_ELEMENT: ReadonlySet<string> = new Set([
  'resourceType',
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension',
  // Definition-level plumbing that appears across request/event resources.
  'instantiatesCanonical',
  'instantiatesUri',
  'instantiates',
  'groupIdentifier',
  'eventHistory',
  'relevantHistory',
  'supportingInformation',
  'supportingInfo',
  'insurance',
  'partOf',
  'basedOn',
  'detectedIssue',
  'protocol',
  'investigation',
  'parameter',
  'subjectType',
]);
