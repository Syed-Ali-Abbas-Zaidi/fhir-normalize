import type { ResourceShape } from '../types';
import { BASE_SHAPE } from './base';
import { CLINICAL_ALIAS, CLINICAL_SHAPE } from './clinical';
import { FINANCIAL_SHAPE } from './financial';
import { FOUNDATION_SHAPE } from './foundation';

export { BASE_SHAPE } from './base';
export { CLINICAL_ALIAS, CLINICAL_SHAPE } from './clinical';
export { FINANCIAL_SHAPE } from './financial';
export { FOUNDATION_SHAPE } from './foundation';

/**
 * Every declared resource shape, grouped by the section it belongs to in the
 * FHIR resource list so coverage stays auditable per section.
 *
 * The Base, Clinical, and Financial sections are covered in full. Foundation
 * is partial by design — only the resources clinical payloads carry often. A
 * resource type
 * with no shape still gets its choice elements resolved; it just has no
 * curated field ordering.
 */
export const RESOURCE_SHAPE: Readonly<Record<string, ResourceShape>> = {
  ...FOUNDATION_SHAPE,
  ...BASE_SHAPE,
  ...CLINICAL_SHAPE,
  ...FINANCIAL_SHAPE,
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
