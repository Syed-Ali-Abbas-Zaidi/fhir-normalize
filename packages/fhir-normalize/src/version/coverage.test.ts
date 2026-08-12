import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import R4_ELEMENTS from '../../spec/r4-elements.json' with { type: 'json' };
import R5_KEYS from '../../spec/r5-keys.json' with { type: 'json' };
import STU3_KEYS from '../../spec/stu3-keys.json' with { type: 'json' };
import { FHIR_VERSION, VERSION_MIGRATION } from './constants';

/**
 * The README quotes how much of each release this table covers. Those numbers
 * were written by hand twice and were wrong both times — once claiming 35
 * handled STU3 elements where the table handles 34, and once listing fourteen
 * resource types under a sentence that said sixteen.
 *
 * A count in prose is a claim like any other here, so it is derived from the
 * table and the digests and compared against what the README says. Change the
 * table and this fails until the documentation catches up.
 */

/**
 * Collapsed to single spaces before matching, so a claim can wrap across lines
 * where that reads best without the assertion caring.
 */
const README = readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8').replace(
  /\s+/g,
  ' ',
);

const capitalize = (value: string): string => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

/** The literal keys an R4 payload of this resource can carry. */
interface Element {
  types: string[];
  choice: boolean;
}

const r4KeysFor = (resourceType: string): ReadonlySet<string> => {
  const elements = (R4_ELEMENTS as unknown as Record<string, Record<string, Element>>)[
    resourceType
  ];
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

/** Per resource, the keys that release has and R4 does not. */
const differingFrom = (release: Record<string, readonly string[]>) => {
  const out: Record<string, string[]> = {};
  for (const [resourceType, keys] of Object.entries(release)) {
    if (!(resourceType in R4_ELEMENTS)) continue;
    const r4 = r4KeysFor(resourceType);
    const absent = keys.filter((key) => !r4.has(key));
    if (absent.length > 0) out[resourceType] = absent;
  }
  return out;
};

const rows = Object.entries(VERSION_MIGRATION).flatMap(([resourceType, migrations]) =>
  migrations.map((migration) => ({ resourceType, ...migration })),
);

const countsFor = (version: string, release: Record<string, readonly string[]>) => {
  const differing = differingFrom(release);
  const total = Object.values(differing).reduce((sum, keys) => sum + keys.length, 0);
  const handled = rows.filter(
    (row) => row.from === version && (differing[row.resourceType] ?? []).includes(row.source),
  ).length;
  return { total, handled, passedThrough: total - handled };
};

/** The resource types that dominate a real export, and the cohort the README quotes. */
const COMMON = [
  'Patient',
  'Observation',
  'Encounter',
  'Condition',
  'MedicationRequest',
  'MedicationStatement',
  'Procedure',
  'AllergyIntolerance',
  'Immunization',
  'DiagnosticReport',
  'DocumentReference',
  'CarePlan',
  'Practitioner',
  'Organization',
  'Location',
  'Coverage',
] as const;

describe('the README describes the table it actually ships', () => {
  it('quotes the STU3 and R5 coverage rows correctly', () => {
    const stu3 = countsFor(FHIR_VERSION.STU3, STU3_KEYS);
    const r5 = countsFor(FHIR_VERSION.R5, R5_KEYS);

    expect(README).toContain(
      `| STU3 → R4 | ${stu3.total} | ${stu3.handled} | ${stu3.passedThrough} |`,
    );
    expect(README).toContain(`| R5 → R4 | ${r5.total} | ${r5.handled} | ${r5.passedThrough} |`);
  });

  it('quotes the row and resource-type totals correctly', () => {
    const resourceTypes = Object.keys(VERSION_MIGRATION);

    expect(README).toContain(`The table has ${rows.length}`);
    expect(README).toContain(`rows in total, across ${resourceTypes.length} resource types`);

    // Named as well as counted, so a new resource type cannot be added without
    // the prose noticing.
    for (const resourceType of resourceTypes) expect(README).toContain(resourceType);
  });

  it('is right that every differing STU3 element in the common cohort is handled', () => {
    const differing = differingFrom(STU3_KEYS);
    const cohort = COMMON.flatMap((resourceType) =>
      (differing[resourceType] ?? []).map((source) => ({ resourceType, source })),
    );
    const unhandled = cohort
      .filter(
        ({ resourceType, source }) =>
          !rows.some(
            (row) =>
              row.from === FHIR_VERSION.STU3 &&
              row.resourceType === resourceType &&
              row.source === source,
          ),
      )
      .map(({ resourceType, source }) => `${resourceType}.${source}`);

    expect(unhandled).toEqual([]);
    expect(README).toContain(`STU3 has ${cohort.length} elements that differ from R4`);
    expect(README).toContain(`all ${cohort.length} are handled`);
  });

  it('names every guarded row the coverage table leaves out', () => {
    // Derived rather than pinned to a count: a new guarded row has to be named
    // in the prose, which is the thing that would otherwise go stale.
    const guarded = rows.filter((row) => row.applies !== undefined);

    expect(guarded.length).toBeGreaterThan(0);
    for (const row of guarded) expect(README).toContain(`${row.resourceType}.${row.source}`);
  });
});
