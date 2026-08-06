import type { SourceFormat } from './types';

/**
 * Every input format the library knows about, including the ones not yet
 * implemented. This is the single source of truth: `SourceFormat` is derived
 * from it, so adding a format here surfaces as a compile error wherever the
 * union is exhaustively handled.
 */
export const SOURCE_FORMAT = {
  FHIR_JSON: 'fhir-json',
  FHIR_XML: 'fhir-xml',
  NDJSON: 'ndjson',
  HL7V2: 'hl7v2',
  CCDA: 'ccda',
  CSV: 'csv',
} as const;

/** Resource type names the core itself needs to recognise. */
export const RESOURCE_TYPE = {
  BUNDLE: 'Bundle',
} as const;

/** The complete R4 `Bundle.type` value set. Doubles as the validation whitelist. */
export const BUNDLE_TYPE = {
  DOCUMENT: 'document',
  MESSAGE: 'message',
  TRANSACTION: 'transaction',
  TRANSACTION_RESPONSE: 'transaction-response',
  BATCH: 'batch',
  BATCH_RESPONSE: 'batch-response',
  HISTORY: 'history',
  SEARCHSET: 'searchset',
  COLLECTION: 'collection',
} as const;

/** What an unrecognised or absent `Bundle.type` falls back to. */
export const DEFAULT_BUNDLE_TYPE = BUNDLE_TYPE.COLLECTION;

/** `Error.name` values, so consumers can branch without importing the classes. */
export const ERROR_NAME = {
  UNSUPPORTED_FORMAT: 'UnsupportedFormatError',
  PARSE: 'ParseError',
} as const;

/** Error copy lives here rather than inline at each `throw`. */
export const ERROR_MESSAGE = {
  NO_PARSER_REGISTERED: (format: SourceFormat, registered: readonly SourceFormat[]): string =>
    `No parser registered for "${format}". Registered formats: ${formatList(registered)}.`,
  UNDETECTABLE_FORMAT: (registered: readonly SourceFormat[]): string =>
    `Could not auto-detect the input format. Registered formats: ${formatList(registered)}.`,
} as const;

const formatList = (formats: readonly SourceFormat[]): string =>
  formats.length > 0 ? formats.join(', ') : 'none';

/** Positions inside a Bundle that every parser can warn about. */
export const BUNDLE_NODE = {
  ENTRY: 'Bundle entry',
  ENTRY_RESOURCE: 'Bundle entry resource',
} as const;

/**
 * Structural warnings about Bundle shape. These live in core rather than in a
 * parser because the same defect means the same thing whatever the input
 * format was — a caller comparing two sources should see identical wording.
 */
export const BUNDLE_WARNING = {
  MISSING_ENTRY: 'Bundle has no "entry" — normalized to an empty collection.',
  ENTRY_NOT_ARRAY: 'Bundle "entry" was not an array — normalized to an empty collection.',
  INVALID_TYPE: (received: unknown, fallback: string): string =>
    `Bundle "type" was ${describeValue(received)}, which is not a valid R4 bundle type — defaulted to "${fallback}".`,
  NOT_AN_OBJECT: (at: string): string => `${at} was not an object — dropped.`,
  EMPTY_ENTRY: (at: string): string =>
    `${at} carries no fields at all — dropped, since a Bundle entry must hold at least a resource, request, response, or fullUrl.`,
  MISSING_RESOURCE_TYPE: (at: string): string =>
    `${at} has no "resourceType" — kept as-is, but it is not a valid FHIR resource.`,
  ENTRY_WITHOUT_RESOURCE: (at: string): string =>
    `${at} has no "resource" — kept as-is (valid for transaction and history bundles).`,
} as const;

/** `Bundle entry` + index -> `Bundle entry [2]`. The index is omitted for a root node. */
export const describeNode = (node: string, index?: number): string =>
  index === undefined ? node : `${node} [${index}]`;

/** Human-readable description of an unexpected value, for warning and error copy. */
export const describeValue = (value: unknown): string => {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return `the string "${value}"`;
  return `a ${typeof value}`;
};
