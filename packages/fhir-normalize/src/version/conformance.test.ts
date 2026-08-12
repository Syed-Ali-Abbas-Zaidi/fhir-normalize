import { describe, expect, it } from 'vitest';
import R4_ELEMENTS from '../../spec/r4-elements.json' with { type: 'json' };
import R5_ELEMENTS from '../../spec/r5-elements.json' with { type: 'json' };
import R5_KEYS from '../../spec/r5-keys.json' with { type: 'json' };
import STU3_ELEMENTS from '../../spec/stu3-elements.json' with { type: 'json' };
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

  it('rewrites onto fields that exist in R4', () => {
    // A rewrite picks its own output keys, so `writes` is the only thing that
    // can be checked against the definitions. Declaring it wrong is as bad as
    // declaring a `target` wrong, and until now nothing looked.
    const missing = rows.flatMap(({ resourceType, migration }) =>
      (migration.writes ?? [])
        .filter((field) => !r4KeysFor(resourceType).has(field))
        .map(
          (field) =>
            `${resourceType}.${migration.source} writes ${field}, which is not an R4 element`,
        ),
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

/**
 * Resources a pattern fits but is deliberately not applied to, with the reason.
 *
 * The bar for an entry is that the digests cannot verify the row. `notDone`
 * writes a status, and R4 binds `status` to a different value set per resource:
 * `Communication` admits `not-done`, while `FamilyMemberHistory`
 * (`partial | completed | entered-in-error | health-unknown`) and
 * `MedicationDispense` do not. These digests carry element types and
 * cardinality and never value-set bindings, so those rows would be claims
 * nothing here could check.
 */
const PATTERN_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  'STU3.notDone': ['Communication', 'FamilyMemberHistory', 'MedicationDispense'],
  'STU3.notGiven': ['MedicationAdministration'],
  /*
   * R4 `Task.reasonCode` and `Task.reasonReference` are `0..1` where every other
   * resource makes them lists, and `toReasonPair` writes lists. Applying it here
   * would put an array in a scalar element. `writes` records which fields a
   * rewrite touches but not whether it writes one or many, so this is the one
   * thing the suite cannot check for itself.
   */
  'R5.reason': ['Task'],
};

describe('a pattern is applied everywhere the definitions say it fits', () => {
  /*
   * Added because coverage was being decided by which resource types someone
   * thought to list rather than by the specification. `reason` was wired to
   * five resources and fits eighteen; STU3 `context` to six and fits seventeen.
   * Every one of those gaps was invisible here: each row present was valid, and
   * nothing asked about the rows absent.
   */
  it('has no resource that fits a known pattern and lacks the row', () => {
    const missing: string[] = [];

    for (const { resourceType, migration } of rows) {
      const release = RELEASE_KEYS[migration.from as FhirVersion];
      if (release === undefined) continue;

      // A `rewrite` does not declare where it writes, so it is matched on the
      // source alone — enough to find a resource carrying the same field.
      const targets =
        migration.target === undefined ? (migration.writes ?? []) : [migration.target];
      const excepted = PATTERN_EXCEPTIONS[`${migration.from}.${migration.source}`] ?? [];

      for (const [candidate, keys] of Object.entries(release)) {
        if (candidate === resourceType || excepted.includes(candidate)) continue;
        if (!keys.includes(migration.source)) continue;

        const r4Keys = r4KeysFor(candidate);
        // Not an R4 resource at all, or R4 has the field too and so it is not a
        // marker for this release.
        if (r4Keys.size === 0 || r4Keys.has(migration.source)) continue;
        if (!targets.every((target) => r4Keys.has(target))) continue;

        const covered = rows.some(
          (row) =>
            row.resourceType === candidate &&
            row.migration.from === migration.from &&
            row.migration.source === migration.source,
        );

        if (!covered) {
          missing.push(
            `${migration.from} ${candidate}.${migration.source} fits the pattern used for ` +
              `${resourceType}.${migration.source} and has no row — add one, or list the resource ` +
              'in PATTERN_EXCEPTIONS with the reason it cannot be verified.',
          );
        }
      }
    }

    expect([...new Set(missing)].sort()).toEqual([]);
  });
});

/** Every release's full element digest, for the questions a key list cannot answer. */
const RELEASE_ELEMENTS: Readonly<Record<string, Record<string, Record<string, Element>>>> = {
  [FHIR_VERSION.STU3]: STU3_ELEMENTS as unknown as Record<string, Record<string, Element>>,
  [FHIR_VERSION.R5]: R5_ELEMENTS as unknown as Record<string, Record<string, Element>>,
};

interface Element {
  types: string[];
  list: boolean;
  choice: boolean;
}

describe('a rename does not change how many values an element holds', () => {
  /*
   * Nothing checked this before, because until now only R4 had a full digest —
   * the other releases were key lists, which say a field exists and not whether
   * it repeats. A rename carries the value across untouched, so renaming a
   * `0..1` element onto a `0..*` one puts a bare object where R4 wants an array,
   * and the reverse puts an array where R4 wants one value. Either produces a
   * Bundle that claims to be R4 and is not.
   *
   * Rows with a `convert` are exempt: reshaping is exactly what a converter is
   * for, and `toList` exists for this.
   */
  it('renames between elements of the same cardinality, or converts', () => {
    const mismatched: string[] = [];

    for (const { resourceType, migration } of rows) {
      if (migration.target === undefined || migration.convert !== undefined) continue;

      const source =
        RELEASE_ELEMENTS[migration.from as FhirVersion]?.[resourceType]?.[migration.source];
      const target = (R4_ELEMENTS as unknown as Record<string, Record<string, Element>>)[
        resourceType
      ]?.[migration.target];

      // A choice element is expanded per type in a payload, so the base element's
      // own cardinality is not what a payload key carries.
      if (source === undefined || target === undefined) continue;
      if (source.choice || target.choice) continue;

      if (source.list !== target.list) {
        mismatched.push(
          `${migration.from} ${resourceType}.${migration.source} is ${source.list ? '0..*' : '0..1'} ` +
            `and R4 ${migration.target} is ${target.list ? '0..*' : '0..1'} — a plain rename ` +
            'would change the shape. Add a `convert`.',
        );
      }
    }

    expect(mismatched).toEqual([]);
  });
});
