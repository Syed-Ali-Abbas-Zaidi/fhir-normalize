/**
 * Errors are structural: R4 says this cannot be shaped that way, and anything
 * consuming the payload as R4 will be wrong about it.
 *
 * Warnings are things R4 does not describe. An element the specification has
 * no entry for is usually an extension-adjacent field or one that belongs to
 * another release, and a report that calls every one of those an error is a
 * report nobody reads twice — a single R5 payload can carry hundreds.
 */
export const VALIDATION_SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
} as const;

export const VALIDATION_CODE = {
  UNKNOWN_RESOURCE_TYPE: 'unknown-resource-type',
  UNKNOWN_ELEMENT: 'unknown-element',
  EXPECTED_LIST: 'expected-list',
  EXPECTED_SINGLE: 'expected-single',
  EMPTY_ARRAY: 'empty-array',
  MISSING_REQUIRED: 'missing-required',
  DISALLOWED_CHOICE_TYPE: 'disallowed-choice-type',
} as const;

export const VALIDATION_MESSAGE = {
  UNKNOWN_RESOURCE_TYPE: (resourceType: string): string =>
    `"${resourceType}" is not an R4 resource type, so nothing here was checked.`,
  UNKNOWN_ELEMENT: (resourceType: string): string =>
    `R4 defines no such element on ${resourceType}.`,
  EXPECTED_LIST: 'R4 allows this element more than once, so it must be an array.',
  EXPECTED_SINGLE: 'R4 allows this element only once, so it must not be an array.',
  EMPTY_ARRAY: 'An empty array is not valid FHIR JSON; omit the element instead.',
  MISSING_REQUIRED: 'R4 requires this element.',
  DISALLOWED_CHOICE_TYPE: (permitted: readonly string[]): string =>
    `R4 does not allow this type here. Permitted: ${permitted.join(', ')}.`,
} as const;

/**
 * Present on any resource, from `Resource` and `DomainResource`, so absent
 * from the per-resource index and never an unknown element.
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
]);
