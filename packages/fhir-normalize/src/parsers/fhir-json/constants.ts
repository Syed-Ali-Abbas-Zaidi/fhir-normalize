import { describeValue } from '../../core';

/** Positions unique to a JSON payload. Bundle-internal nodes live in core. */
export const JSON_NODE = {
  ROOT: 'Root object',
  ARRAY_ITEM: 'Root array item',
} as const;

/** Recoverable gaps specific to JSON input. Structural Bundle warnings live in core. */
export const FHIR_JSON_WARNING = {
  ROOT_ARRAY: 'Root was a JSON array — each item was treated as a resource in a collection Bundle.',
} as const;

/** Unrecoverable failures. These throw a `ParseError`. */
export const FHIR_JSON_ERROR = {
  MALFORMED: 'Input is not valid JSON.',
  UNSUPPORTED_ROOT: (received: unknown): string =>
    `Input decoded to ${describeValue(received)}; a FHIR JSON payload must be an object or an array.`,
} as const;
