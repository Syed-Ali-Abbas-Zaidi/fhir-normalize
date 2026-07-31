import type { BundleType } from '../../core';

/**
 * Where in the payload a warning came from. Combined with an index by
 * `describeNode` to produce e.g. `Bundle entry [2]`.
 */
export const JSON_NODE = {
  ROOT: 'Root object',
  ARRAY_ITEM: 'Root array item',
  BUNDLE_ENTRY: 'Bundle entry',
  ENTRY_RESOURCE: 'Bundle entry resource',
} as const;

/**
 * Recoverable gaps. These become `meta.warnings` — the parser keeps going and
 * preserves whatever the payload did contain.
 */
export const FHIR_JSON_WARNING = {
  ROOT_ARRAY: 'Root was a JSON array — each item was treated as a resource in a collection Bundle.',
  BUNDLE_MISSING_ENTRY: 'Bundle has no "entry" — normalized to an empty collection.',
  BUNDLE_ENTRY_NOT_ARRAY: 'Bundle "entry" was not an array — normalized to an empty collection.',
  BUNDLE_INVALID_TYPE: (received: unknown, fallback: BundleType): string =>
    `Bundle "type" was ${describeValue(received)}, which is not a valid R4 bundle type — defaulted to "${fallback}".`,
  NOT_AN_OBJECT: (at: string): string => `${at} was not an object — dropped.`,
  MISSING_RESOURCE_TYPE: (at: string): string =>
    `${at} has no "resourceType" — kept as-is, but it is not a valid FHIR resource.`,
  ENTRY_WITHOUT_RESOURCE: (at: string): string =>
    `${at} has no "resource" — kept as-is (valid for transaction and history bundles).`,
} as const;

/** Unrecoverable failures. These throw a `ParseError`. */
export const FHIR_JSON_ERROR = {
  MALFORMED: 'Input is not valid JSON.',
  UNSUPPORTED_ROOT: (received: unknown): string =>
    `Input decoded to ${describeValue(received)}; a FHIR JSON payload must be an object or an array.`,
} as const;

/** `Bundle entry` + index -> `Bundle entry [2]`. Index is omitted for the root. */
export const describeNode = (node: string, index?: number): string =>
  index === undefined ? node : `${node} [${index}]`;

const describeValue = (value: unknown): string => {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return `the string "${value}"`;
  return `a ${typeof value}`;
};
