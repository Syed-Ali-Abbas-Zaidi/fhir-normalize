import { simplifyBundle } from 'fhir-normalize';
import { CELL_MODE, LIST_MODE, type SimplifiedResource } from 'fhir-normalize/simplified';
import { describe, expect, it } from 'vitest';
import { NO_EXPLODE, PARSE_MODE, RESULT_STATE, SAMPLES } from '@/constants';
import { parseForDisplay } from '@/utils/normalize';
import { explodableFields, rowOptionsFrom, rowTables, toCsv } from '@/utils/rows';

/**
 * The Rows tab is the one view that reshapes the data rather than displaying
 * it, so it is the one that can be wrong without looking wrong. These run the
 * page's own projection over the page's own samples.
 */

const simplify = (payload: string): SimplifiedResource[] => {
  const result = parseForDisplay(payload, PARSE_MODE.AUTO);
  if (result.state !== RESULT_STATE.OK) throw new Error('sample did not parse');

  return simplifyBundle(result.bundle);
};

/** By label rather than position, so reordering the samples cannot mislead. */
const sample = (label: string): SimplifiedResource[] => {
  const found = SAMPLES.find((entry) => entry.label === label);
  if (found === undefined) throw new Error(`no sample labelled "${label}"`);

  return simplify(found.payload);
};

const samples = SAMPLES.map((entry) => [entry.label, entry.payload] as const);

const defaults = rowOptionsFrom(LIST_MODE.FIRST, CELL_MODE.TEXT, NO_EXPLODE);

/** The first table, or a failure — every assertion below needs one. */
const firstTable = (resources: SimplifiedResource[], options = defaults) => {
  const [table] = rowTables(resources, options);
  if (table === undefined) throw new Error('projection produced no table');

  return table;
};

describe('every sample projects into rows', () => {
  it.each(samples)('%s produces at least one table', (_label, payload) => {
    expect(rowTables(simplify(payload), defaults).length).toBeGreaterThan(0);
  });

  it.each(samples)('%s gives every row of a table the same columns', (_label, payload) => {
    for (const table of rowTables(simplify(payload), defaults)) {
      for (const { cells } of table.rows) {
        // A ragged row is what a CSV writer cannot survive, and it is invisible
        // on screen — the cell simply renders empty either way.
        expect(Object.keys(cells)).toEqual(table.columns);
      }
    }
  });

  it.each(samples)('%s writes a rectangular CSV', (_label, payload) => {
    for (const table of rowTables(simplify(payload), defaults)) {
      const widths = toCsv(table)
        .split('\n')
        .map((line) => line.split(',').length);

      expect(new Set(widths).size).toBe(1);
    }
  });
});

describe('the option bar changes what it says it changes', () => {
  const BLOOD_PRESSURE = 'Blood pressure';

  it('offers only repeating fields the parsed resources actually carry', () => {
    const resources = sample(BLOOD_PRESSURE);
    const offered = explodableFields(resources);

    expect(offered).toContain('component');
    for (const field of offered) {
      expect(resources.some((resource) => Array.isArray(resource.fields[field]))).toBe(true);
    }
  });

  it('turns one Observation with two components into two rows', () => {
    const options = rowOptionsFrom(LIST_MODE.FIRST, CELL_MODE.TEXT, 'component');
    const table = firstTable(sample(BLOOD_PRESSURE), options);

    expect(table.rows.map(({ cells }) => cells.component_code)).toEqual(['Systolic', 'Diastolic']);
    expect(table.rows.map(({ cells }) => cells.component_index)).toEqual([0, 1]);
  });

  it('numbers the columns when lists are indexed', () => {
    const options = rowOptionsFrom(LIST_MODE.INDEX, CELL_MODE.TEXT, NO_EXPLODE);
    const table = firstTable(sample(BLOOD_PRESSURE), options);

    expect(table.columns).toContain('component_0_code');
    expect(table.columns).toContain('component_1_code');
  });

  it('adds the coded value when cells are typed', () => {
    const typed = rowOptionsFrom(LIST_MODE.FIRST, CELL_MODE.TYPED, NO_EXPLODE);

    expect(firstTable(sample(BLOOD_PRESSURE)).columns).not.toContain('code_code');
    expect(firstTable(sample(BLOOD_PRESSURE), typed).rows[0]?.cells.code_code).toBe('85354-9');
  });

  it('has no explode field to offer for a payload without repeating elements', () => {
    // The picker follows the data, so a field chosen for one payload cannot
    // survive into another that has nothing to explode.
    expect(explodableFields(sample('Observation'))).not.toContain('component');
  });
});

describe('the CSV the copy button hands over', () => {
  it('leads with the column header', () => {
    const table = firstTable(sample('Patient'));
    const [header] = toCsv(table).split('\n');

    expect(header).toBe(table.columns.join(','));
  });

  it('quotes every value, so a comma inside a cell cannot split it', () => {
    const table = firstTable(sample('Patient'));
    const [, first = ''] = toCsv(table).split('\n');

    expect(first.startsWith('"Patient"')).toBe(true);
  });
});
