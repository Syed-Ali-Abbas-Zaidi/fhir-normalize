import type { Bundle, FhirResource } from 'fhir/r4';
import {
  createCollectionBundle,
  describeNode,
  isBundleRecord,
  isRecord,
  normalizeBundleRecord,
  ParseError,
  SOURCE_FORMAT,
  toResourceRecord,
  type WarningLog,
} from '../../core';
import { FHIR_JSON_ERROR, FHIR_JSON_WARNING, JSON_NODE } from './constants';

/**
 * Decode raw input into a plain JSON value. Objects pass through untouched so
 * callers can hand us an already-parsed payload.
 *
 * @throws {ParseError} The string is not valid JSON.
 */
export const decodeJson = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw;

  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new ParseError(SOURCE_FORMAT.FHIR_JSON, FHIR_JSON_ERROR.MALFORMED, { cause });
  }
};

/** Non-throwing variant used by `canParse`, which must never throw. */
export const tryDecodeJson = (raw: unknown): unknown => {
  try {
    return decodeJson(raw);
  } catch {
    return undefined;
  }
};

/**
 * Normalize a decoded JSON value into a canonical R4 Bundle.
 *
 * @throws {ParseError} The value is neither an object nor an array.
 */
export const toBundle = (value: unknown, warnings: WarningLog): Bundle => {
  if (Array.isArray(value)) {
    warnings.add(FHIR_JSON_WARNING.ROOT_ARRAY);
    return createCollectionBundle(toResources(value, warnings));
  }

  if (isRecord(value)) {
    if (isBundleRecord(value)) return normalizeBundleRecord(value, warnings);

    const resource = toResourceRecord(value, JSON_NODE.ROOT, warnings);
    return createCollectionBundle(resource ? [resource] : []);
  }

  throw new ParseError(SOURCE_FORMAT.FHIR_JSON, FHIR_JSON_ERROR.UNSUPPORTED_ROOT(value));
};

const toResources = (values: readonly unknown[], warnings: WarningLog): FhirResource[] =>
  values
    .map((value, index) =>
      toResourceRecord(value, describeNode(JSON_NODE.ARRAY_ITEM, index), warnings),
    )
    .filter((resource): resource is FhirResource => resource !== null);
