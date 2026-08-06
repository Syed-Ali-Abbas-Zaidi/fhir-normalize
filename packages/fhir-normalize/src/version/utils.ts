import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import { describeNode, isRecord, type UnknownRecord, type WarningLog } from '../core';
import { RESOURCE_TYPE_RENAME, VERSION_MIGRATION, VERSION_WARNING } from './constants';
import type { FieldMigration } from './types';

/** `Observation/obs-1` when there is an id, `Observation [2]` otherwise. */
const describeResource = (resourceType: string, id: unknown, index: number): string =>
  typeof id === 'string' && id !== '' ? `${resourceType}/${id}` : describeNode(resourceType, index);

/**
 * Migrate every resource in a Bundle onto R4.
 *
 * Resources already in R4 are left untouched: each migration only fires when
 * its source field is present (and its `applies` guard passes), so an R4
 * payload produces no changes and no warnings.
 */
export const migrateBundleToR4 = (bundle: Bundle, warnings: WarningLog): Bundle => {
  const { entry } = bundle;
  if (!Array.isArray(entry)) return bundle;

  return { ...bundle, entry: entry.map((item, index) => migrateEntry(item, index, warnings)) };
};

const migrateEntry = (entry: BundleEntry, index: number, warnings: WarningLog): BundleEntry => {
  const { resource } = entry;
  if (!isRecord(resource)) return entry;

  const migrated = migrateResource(resource, index, warnings);
  return { ...entry, resource: migrated as unknown as FhirResource };
};

const migrateResource = (
  resource: UnknownRecord,
  index: number,
  warnings: WarningLog,
): UnknownRecord => {
  const sourceType = typeof resource.resourceType === 'string' ? resource.resourceType : '';
  const at = describeResource(sourceType || 'Resource', resource.id, index);

  const renamedType = RESOURCE_TYPE_RENAME[sourceType];
  if (renamedType !== undefined) {
    warnings.add(VERSION_WARNING.RESOURCE_RENAMED(at, sourceType, renamedType));
  }
  const resourceType = renamedType ?? sourceType;

  const migrations = VERSION_MIGRATION[resourceType] ?? [];
  const result = migrations.reduce(
    (current, migration) => applyMigration(current, migration, at, warnings),
    resourceType === sourceType ? { ...resource } : { ...resource, resourceType },
  );

  return migrateContained(result, index, warnings);
};

/** Contained resources are full resources, so they get the same treatment. */
const migrateContained = (
  resource: UnknownRecord,
  index: number,
  warnings: WarningLog,
): UnknownRecord => {
  const { contained } = resource;
  if (!Array.isArray(contained)) return resource;

  return {
    ...resource,
    contained: contained.map((item) =>
      isRecord(item) ? migrateResource(item, index, warnings) : item,
    ),
  };
};

const applyMigration = (
  resource: UnknownRecord,
  migration: FieldMigration,
  at: string,
  warnings: WarningLog,
): UnknownRecord => {
  const { from, source, applies, target, convert, rewrite, reason } = migration;

  const value = resource[source];
  if (value === undefined) return resource;
  if (applies !== undefined && !applies(value)) return resource;

  const rest = { ...resource };
  delete rest[source];
  const note = reason === undefined ? '' : ` ${reason}`;

  if (rewrite !== undefined) {
    const fields = rewrite(value);
    warnings.add(VERSION_WARNING.REWRITTEN(at, from, source, Object.keys(fields)) + note);
    return { ...rest, ...fields };
  }

  if (target !== undefined) {
    const converted = convert === undefined ? value : convert(value);

    // A converter that cannot produce something conformant with the R4 element
    // returns `undefined`. Writing it anyway would put a value R4 does not
    // allow into a bundle claiming to be R4, so the element goes instead — and
    // the warning says dropped rather than migrated.
    if (converted === undefined) {
      warnings.add(VERSION_WARNING.UNCONVERTIBLE(at, from, source, target) + note);
      return rest;
    }

    if (target !== source) {
      warnings.add(VERSION_WARNING.RENAMED(at, from, source, target) + note);
    } else if (reason !== undefined) {
      warnings.add(VERSION_WARNING.REWRITTEN(at, from, source, [target]) + note);
    }
    return { ...rest, [target]: converted };
  }

  warnings.add(VERSION_WARNING.DROPPED(at, from, source) + note);
  return rest;
};
