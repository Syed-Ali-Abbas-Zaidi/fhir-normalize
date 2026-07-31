import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import {
  createCollectionBundle,
  DEFAULT_BUNDLE_TYPE,
  isBundleRecord,
  isBundleType,
  isNonEmptyString,
  isRecord,
  ParseError,
  RESOURCE_TYPE,
  SOURCE_FORMAT,
  type UnknownRecord,
  type WarningLog,
} from '../../core';
import { describeNode, FHIR_JSON_ERROR, FHIR_JSON_WARNING, JSON_NODE } from './constants';

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
    return createCollectionBundle(toResources(value, JSON_NODE.ARRAY_ITEM, warnings));
  }

  if (isRecord(value)) {
    if (isBundleRecord(value)) return normalizeBundle(value, warnings);

    const resource = toResource(value, JSON_NODE.ROOT, warnings);
    return createCollectionBundle(resource ? [resource] : []);
  }

  throw new ParseError(SOURCE_FORMAT.FHIR_JSON, FHIR_JSON_ERROR.UNSUPPORTED_ROOT(value));
};

/**
 * Rebuild an incoming Bundle with a validated `type` and `entry`. Unknown
 * top-level fields are spread through untouched — dropping data we did not
 * anticipate would defeat the point of using FHIR as the canonical model.
 */
const normalizeBundle = (bundle: UnknownRecord, warnings: WarningLog): Bundle => {
  const { type, entry } = bundle;

  if (!isBundleType(type)) {
    warnings.add(FHIR_JSON_WARNING.BUNDLE_INVALID_TYPE(type, DEFAULT_BUNDLE_TYPE));
  }

  return {
    ...bundle,
    resourceType: RESOURCE_TYPE.BUNDLE,
    type: isBundleType(type) ? type : DEFAULT_BUNDLE_TYPE,
    entry: normalizeEntries(entry, warnings),
  } as Bundle;
};

const normalizeEntries = (entry: unknown, warnings: WarningLog): BundleEntry[] => {
  if (entry === undefined) {
    warnings.add(FHIR_JSON_WARNING.BUNDLE_MISSING_ENTRY);
    return [];
  }

  if (!Array.isArray(entry)) {
    warnings.add(FHIR_JSON_WARNING.BUNDLE_ENTRY_NOT_ARRAY);
    return [];
  }

  return entry
    .map((item, index) => normalizeEntry(item, index, warnings))
    .filter((item): item is BundleEntry => item !== null);
};

const normalizeEntry = (
  value: unknown,
  index: number,
  warnings: WarningLog,
): BundleEntry | null => {
  const at = describeNode(JSON_NODE.BUNDLE_ENTRY, index);

  if (!isRecord(value)) {
    warnings.add(FHIR_JSON_WARNING.NOT_AN_OBJECT(at));
    return null;
  }

  // Transaction and history bundles legitimately carry request-only entries.
  if (value.resource === undefined) {
    warnings.add(FHIR_JSON_WARNING.ENTRY_WITHOUT_RESOURCE(at));
    return value as BundleEntry;
  }

  const resourceAt = describeNode(JSON_NODE.ENTRY_RESOURCE, index);
  const resource = toResource(value.resource, resourceAt, warnings);
  if (!resource) return null;

  return { ...value, resource } as BundleEntry;
};

const toResources = (
  values: readonly unknown[],
  node: string,
  warnings: WarningLog,
): FhirResource[] =>
  values
    .map((value, index) => toResource(value, describeNode(node, index), warnings))
    .filter((resource): resource is FhirResource => resource !== null);

/**
 * Assert a decoded object is a FHIR resource. Deliberately shallow: the value
 * is passed through with all its fields intact and a warning is raised when the
 * discriminator is missing, rather than validating field by field and dropping
 * anything unrecognised.
 */
const toResource = (value: unknown, at: string, warnings: WarningLog): FhirResource | null => {
  if (!isRecord(value)) {
    warnings.add(FHIR_JSON_WARNING.NOT_AN_OBJECT(at));
    return null;
  }

  if (!isNonEmptyString(value.resourceType)) {
    warnings.add(FHIR_JSON_WARNING.MISSING_RESOURCE_TYPE(at));
  }

  return value as unknown as FhirResource;
};
