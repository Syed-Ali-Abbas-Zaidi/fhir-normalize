import { describe, expect, it } from 'vitest';
import R4_ELEMENTS from '../../spec/r4-elements.json' with { type: 'json' };
import R5_KEYS from '../../spec/r5-keys.json' with { type: 'json' };
import STU3_KEYS from '../../spec/stu3-keys.json' with { type: 'json' };
import { FHIR_VERSION, RESOURCE_TYPE_RENAME, VERSION_MIGRATION } from './constants';
import type { FhirVersion } from './types';

/**
 * The migration table checked against the STU3, R4 and R5 definitions.
 *
 * This table rewrites clinical data rather than merely describing it, so a
 * wrong row corrupts a payload silently. It carries more risk than the shape
 * tables and had the same provenance — written from knowledge of FHIR — so it
 * gets the same treatment.
 *
 * The property that matters most is the third test. Migration is
 * marker-driven: a row fires when it sees `source` on a resource, because FHIR
 * resources do not record which release they belong to. That is only safe if
 * `source` cannot appear in a genuine R4 payload. If it can, valid R4 input
 * gets rewritten as though it were STU3 or R5.
 */

const capitalize = (value: string): string => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

const RELEASE_KEYS: Readonly<Record<string, Record<string, readonly string[]>>> = {
  [FHIR_VERSION.STU3]: STU3_KEYS,
  [FHIR_VERSION.R5]: R5_KEYS,
};

/**
 * The literal keys an R4 payload of this resource can carry. A choice element
 * is expanded per type — R4 serializes `medication[x]` as
 * `medicationCodeableConcept`, so the bare name never appears in a payload.
 */
const r4KeysFor = (resourceType: string): ReadonlySet<string> => {
  const elements: Record<string, { types: string[]; choice: boolean }> | undefined = (
    R4_ELEMENTS as Record<string, Record<string, { types: string[]; choice: boolean }>>
  )[resourceType];

  const keys = new Set<string>();
  if (elements === undefined) return keys;

  for (const [name, element] of Object.entries(elements)) {
    if (!element.choice) {
      keys.add(name);
      continue;
    }

    for (const type of element.types) keys.add(name + capitalize(type));
  }

  return keys;
};

/** Every row, flattened with the resource type it belongs to. */
const rows = Object.entries(VERSION_MIGRATION).flatMap(([resourceType, migrations]) =>
  migrations.map((migration) => ({ resourceType, migration })),
);

describe('the migration table matches the releases it claims', () => {
  it('has rows to check', () => {
    // Guards the suite itself: an empty table would pass everything below.
    expect(rows.length).toBeGreaterThan(0);
  });

  it('migrates only fields that exist in the release they come from', () => {
    const unknown = rows
      .filter(({ resourceType, migration }) => {
        const keys = RELEASE_KEYS[migration.from as FhirVersion]?.[resourceType];
        return keys === undefined || !keys.includes(migration.source);
      })
      .map(
        ({ resourceType, migration }) =>
          `${migration.from} ${resourceType}.${migration.source} is not an element of that resource in ${migration.from}`,
      );

    expect(unknown).toEqual([]);
  });

  it('never fires an unguarded marker that a genuine R4 payload could carry', () => {
    const ambiguous = rows
      .filter(({ migration }) => migration.applies === undefined)
      .filter(({ resourceType, migration }) => r4KeysFor(resourceType).has(migration.source))
      .map(
        ({ resourceType, migration }) =>
          `${migration.from} ${resourceType}.${migration.source} is also an R4 payload key — an ` +
          'unguarded marker would rewrite genuine R4 data. Add an `applies` guard.',
      );

    expect(ambiguous).toEqual([]);
  });

  /*
   * Added after a real collision. `Encounter.reason` exists in STU3 as a
   * CodeableConcept list and in R5 as a backbone, so the table had two rows on
   * the same field. Migration is marker-driven and the stage reduces in order,
   * so the first row renamed the other release's shape wholesale — and both
   * rows passed every other check here, because each is valid on its own.
   *
   * Two rows may share a source only if all but one can tell their own shape
   * apart with an `applies` guard.
   */
  it('never leaves two rows competing for the same field unguarded', () => {
    const bySource = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.resourceType}.${row.migration.source}`;
      bySource.set(key, [...(bySource.get(key) ?? []), row]);
    }

    const ambiguous = [...bySource]
      .filter(([, group]) => group.length > 1)
      .filter(
        ([, group]) => group.filter(({ migration }) => migration.applies === undefined).length > 1,
      )
      .map(
        ([key, group]) =>
          `${key} has ${group.length} rows and ${group.filter(({ migration }) => migration.applies === undefined).length} without an \`applies\` guard — ` +
          'whichever runs first claims the field for every release.',
      );

    expect(ambiguous).toEqual([]);
  });

  it('renames onto fields that exist in R4', () => {
    const missing = rows
      .filter(({ migration }) => migration.target !== undefined)
      .filter(
        ({ resourceType, migration }) => !r4KeysFor(resourceType).has(migration.target as string),
      )
      .map(
        ({ resourceType, migration }) =>
          `${resourceType}.${migration.source} -> ${migration.target}: target is not an R4 element`,
      );

    expect(missing).toEqual([]);
  });

  it('renames resource types onto R4 types that exist, from types that do not', () => {
    const problems = Object.entries(RESOURCE_TYPE_RENAME).flatMap(([from, to]) => {
      const found: string[] = [];
      if (!(to in R4_ELEMENTS)) found.push(`${from} -> ${to}: ${to} is not an R4 resource`);
      // A type R4 still has is not a rename; renaming it would lose data.
      if (from in R4_ELEMENTS) found.push(`${from} -> ${to}: ${from} is itself an R4 resource`);
      return found;
    });

    expect(problems).toEqual([]);
  });
});
