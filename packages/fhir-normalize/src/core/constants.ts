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
