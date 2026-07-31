import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import { BUNDLE_TYPE, RESOURCE_TYPE } from './constants';
import { isRecord } from './guards';
import type { BundleType, UnknownRecord } from './types';

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
