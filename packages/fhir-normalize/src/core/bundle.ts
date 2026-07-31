import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import {
  BUNDLE_NODE,
  BUNDLE_TYPE,
  BUNDLE_WARNING,
  DEFAULT_BUNDLE_TYPE,
  describeNode,
  RESOURCE_TYPE,
} from './constants';
import { isNonEmptyString, isRecord } from './guards';
import type { BundleType, UnknownRecord, WarningLog } from './types';

const bundleTypes = new Set<string>(Object.values(BUNDLE_TYPE));

/**
 * Discriminator check for a value already known to be a plain object.
 *
 * Kept separate from {@link isBundle} because a `value is Bundle` narrowing
 * would claim the interior is valid too; parsers need to keep treating it as
 * untrusted while they validate it field by field.
 */
export const isBundleRecord = (record: UnknownRecord): boolean =>
  record.resourceType === RESOURCE_TYPE.BUNDLE;

/**
 * True when the value looks like a Bundle. Only the discriminator is checked —
 * the interior is still untrusted, so callers must validate what they read.
 */
export const isBundle = (value: unknown): value is Bundle =>
  isRecord(value) && isBundleRecord(value);

/** True when the value is one of the nine R4 `Bundle.type` codes. */
export const isBundleType = (value: unknown): value is BundleType =>
  typeof value === 'string' && bundleTypes.has(value);

/** Wrap loose resources into the canonical collection Bundle every parser returns. */
export const createCollectionBundle = (resources: readonly FhirResource[]): Bundle => ({
  resourceType: RESOURCE_TYPE.BUNDLE,
  type: BUNDLE_TYPE.COLLECTION,
  entry: resources.map(toEntry),
});

const toEntry = (resource: FhirResource): BundleEntry => ({ resource });

/**
 * Rebuild an untrusted Bundle-shaped record with a validated `type` and
 * `entry`. Unknown top-level fields are spread through untouched — dropping
 * data we did not anticipate would defeat the point of using FHIR as the
 * canonical model.
 *
 * Shared by every parser: a malformed Bundle means the same thing whether it
 * arrived as JSON or XML.
 */
export const normalizeBundleRecord = (record: UnknownRecord, warnings: WarningLog): Bundle => {
  const { type, entry } = record;

  if (!isBundleType(type)) {
    warnings.add(BUNDLE_WARNING.INVALID_TYPE(type, DEFAULT_BUNDLE_TYPE));
  }

  return {
    ...record,
    resourceType: RESOURCE_TYPE.BUNDLE,
    type: isBundleType(type) ? type : DEFAULT_BUNDLE_TYPE,
    entry: normalizeEntries(entry, warnings),
  } as Bundle;
};

const normalizeEntries = (entry: unknown, warnings: WarningLog): BundleEntry[] => {
  if (entry === undefined) {
    warnings.add(BUNDLE_WARNING.MISSING_ENTRY);
    return [];
  }

  if (!Array.isArray(entry)) {
    warnings.add(BUNDLE_WARNING.ENTRY_NOT_ARRAY);
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
  const at = describeNode(BUNDLE_NODE.ENTRY, index);

  if (!isRecord(value)) {
    warnings.add(BUNDLE_WARNING.NOT_AN_OBJECT(at));
    return null;
  }

  // An entry that lost its only content — e.g. an empty <resource> in XML —
  // would otherwise survive as `{}`, which is not a valid BundleEntry.
  if (Object.keys(value).length === 0) {
    warnings.add(BUNDLE_WARNING.EMPTY_ENTRY(at));
    return null;
  }

  // Transaction and history bundles legitimately carry request-only entries.
  if (value.resource === undefined) {
    warnings.add(BUNDLE_WARNING.ENTRY_WITHOUT_RESOURCE(at));
    return value as BundleEntry;
  }

  const resource = toResourceRecord(
    value.resource,
    describeNode(BUNDLE_NODE.ENTRY_RESOURCE, index),
    warnings,
  );
  if (!resource) return null;

  return { ...value, resource } as BundleEntry;
};

/**
 * Assert an untrusted value is a FHIR resource. Deliberately shallow: the value
 * passes through with all its fields intact and a warning is raised when the
 * `resourceType` discriminator is missing, rather than validating field by
 * field and dropping anything unrecognised.
 *
 * Returns `null` only when the value cannot be a resource at all.
 */
export const toResourceRecord = (
  value: unknown,
  at: string,
  warnings: WarningLog,
): FhirResource | null => {
  if (!isRecord(value)) {
    warnings.add(BUNDLE_WARNING.NOT_AN_OBJECT(at));
    return null;
  }

  if (!isNonEmptyString(value.resourceType)) {
    warnings.add(BUNDLE_WARNING.MISSING_RESOURCE_TYPE(at));
  }

  return value as unknown as FhirResource;
};
