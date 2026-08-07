import { describe, expect, it } from 'vitest';
import { CELL_MODE, LIST_MODE } from './constants';
import { columnsOf, toRows, toTables } from './rows';
import type { Cell, Row, SimplifiedResource } from './types';
import { simplifyResource } from './utils';

const observation = (extra: object): SimplifiedResource =>
  simplifyResource({
    resourceType: 'Observation',
    id: 'obs-1',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }],
      text: 'Body Weight',
    },
    ...extra,
  });

const patient = (extra: object): SimplifiedResource =>
  simplifyResource({ resourceType: 'Patient', id: 'pat-1', ...extra });

const bloodPressure = observation({
  code: { text: 'Blood pressure panel' },
  component: [
    { code: { text: 'Systolic' }, valueQuantity: { value: 118, unit: 'mmHg' } },
    { code: { text: 'Diastolic' }, valueQuantity: { value: 76, unit: 'mmHg' } },
  ],
});

describe('toRows — one flat record per resource', () => {
  it('leads with the resource identity', () => {
    const [row] = toRows([observation({ valueQuantity: { value: 74.5, unit: 'kg' } })]);

    expect(Object.keys(row ?? {}).slice(0, 3)).toEqual(['resourceType', 'id', 'display']);
    expect(row).toMatchObject({
      resourceType: 'Observation',
      id: 'obs-1',
      display: 'Body Weight · 74.5 kg',
    });
  });

  it('puts every value[x] in the same column, whatever the input carried', () => {
    const [quantity] = toRows([observation({ valueQuantity: { value: 74.5, unit: 'kg' } })]);
    const [text] = toRows([observation({ valueString: 'looks fine' })]);

    expect(quantity?.value).toBe('74.5 kg');
    expect(text?.value).toBe('looks fine');
  });

  it('renders a cell as the value text by default', () => {
    const [row] = toRows([observation({ subject: { reference: 'Patient/pat-1' } })]);

    expect(row).toMatchObject({ status: 'final', code: 'Body Weight', subject: 'Patient/pat-1' });
  });

  it('leaves an empty cell empty rather than carrying the display placeholder', () => {
    // A Quantity with neither value nor unit renders as an em-dash for a
    // reader; a table wants a real null.
    const [row] = toRows([observation({ valueQuantity: { system: 'http://unitsofmeasure.org' } })]);

    expect(row?.value).toBeNull();
  });

  it('returns nothing for no resources', () => {
    expect(toRows([])).toEqual([]);
  });
});

describe('toRows — repeating elements', () => {
  const twoNames = patient({
    name: [
      { family: 'Khan', given: ['Ali'] },
      { family: 'Khan', given: ['Ali', 'Reza'], use: 'official' },
    ],
  });

  it('takes the first entry and reports how many there were', () => {
    const [row] = toRows([twoNames]);

    expect(row).toMatchObject({ name: 'Ali Khan', name_count: 2 });
  });

  it('numbers the columns when asked for every entry', () => {
    const [row] = toRows([twoNames], { lists: LIST_MODE.INDEX });

    expect(row).toMatchObject({ name_0: 'Ali Khan', name_1: 'Ali Reza Khan' });
    expect(row).not.toHaveProperty('name_count');
  });

  it('counts a repeating element that arrived with no entries', () => {
    const empty: SimplifiedResource = {
      resourceType: 'Patient',
      id: 'pat-1',
      display: 'pat-1',
      fields: { name: [] },
      unmapped: [],
    };

    expect(toRows([empty])).toEqual([
      { resourceType: 'Patient', id: 'pat-1', display: 'pat-1', name_count: 0 },
    ]);
  });
});

describe('toRows — backbone elements', () => {
  it('flattens a group under its own column prefix', () => {
    const [row] = toRows([bloodPressure]);

    expect(row).toMatchObject({
      component_code: 'Systolic',
      component_value: '118 mmHg',
      component_count: 2,
    });
  });

  it('numbers each group when asked for every entry', () => {
    const [row] = toRows([bloodPressure], { lists: LIST_MODE.INDEX });

    expect(row).toMatchObject({
      component_0_code: 'Systolic',
      component_0_value: '118 mmHg',
      component_1_code: 'Diastolic',
      component_1_value: '76 mmHg',
    });
  });

  it('keeps nesting under one prefix for a group inside a group', () => {
    const [row] = toRows([
      observation({
        component: [
          {
            code: { text: 'Systolic' },
            valueQuantity: { value: 118, unit: 'mmHg' },
            referenceRange: [{ low: { value: 90, unit: 'mmHg' }, text: 'normal' }],
          },
        ],
      }),
    ]);

    expect(row).toMatchObject({
      component_referenceRange_low: '90 mmHg',
      component_referenceRange_text: 'normal',
    });
  });
});

describe('toRows — exploding one field into rows', () => {
  it('produces a row per entry, duplicating the other columns', () => {
    const rows = toRows([bloodPressure], { explode: 'component' });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.component_code, row.component_value])).toEqual([
      ['Systolic', '118 mmHg'],
      ['Diastolic', '76 mmHg'],
    ]);
    expect(rows.every((row) => row.id === 'obs-1' && row.code === 'Blood pressure panel')).toBe(
      true,
    );
  });

  it('says which entry each row came from, and how many there were', () => {
    const rows = toRows([bloodPressure], { explode: 'component' });

    expect(rows.map((row) => row.component_index)).toEqual([0, 1]);
    expect(rows.map((row) => row.component_count)).toEqual([2, 2]);
  });

  it('explodes a repeating value as readily as a group', () => {
    const rows = toRows([patient({ name: [{ family: 'Khan' }, { family: 'Ahmed' }] })], {
      explode: 'name',
    });

    expect(rows.map((row) => row.name)).toEqual(['Khan', 'Ahmed']);
  });

  it('keeps a resource that has no such field, as one row', () => {
    const rows = toRows([bloodPressure, observation({ valueString: 'no components' })], {
      explode: 'component',
    });

    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ value: 'no components', component_code: null });
  });

  it('leaves a same-named field inside a group alone', () => {
    // Patient.contact.name is not Patient.name, so exploding `name` must not
    // reach into it.
    const rows = toRows(
      [patient({ name: [{ family: 'Khan' }], contact: [{ name: { family: 'Ahmed' } }] })],
      { explode: 'name' },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Khan', contact_name: 'Ahmed' });
  });
});

describe('toRows — typed cells', () => {
  const typed = { cells: CELL_MODE.TYPED } as const;

  it('keeps the coded value rather than only its display name', () => {
    const [row] = toRows([observation({ valueQuantity: { value: 74.5, unit: 'kg' } })], typed);

    expect(row).toMatchObject({
      code: 'Body Weight',
      code_kind: 'concept',
      code_code: '29463-7',
      code_system: 'http://loinc.org',
      code_display: 'Body Weight',
    });
  });

  it('keeps a number as a number and a boolean as a boolean', () => {
    const [row] = toRows([observation({ valueQuantity: { value: 74.5, unit: 'kg' } })], typed);
    const [flag] = toRows([patient({ active: true })], typed);

    expect(row).toMatchObject({ value: '74.5 kg', value_value: 74.5, value_unit: 'kg' });
    expect(flag).toMatchObject({ active: 'true', active_value: true });
  });

  it('flattens a value nested inside a value', () => {
    const [row] = toRows(
      [
        observation({
          valueRange: { low: { value: 4.5, unit: 'mmol/L' }, high: { value: 6.1, unit: 'mmol/L' } },
        }),
      ],
      typed,
    );

    expect(row).toMatchObject({
      value_kind: 'range',
      value_low_value: 4.5,
      value_low_unit: 'mmol/L',
      value_high_value: 6.1,
    });
  });

  it('joins a repeating primitive into one cell', () => {
    const [row] = toRows([patient({ name: [{ family: 'Khan', given: ['Ali', 'Reza'] }] })], typed);

    expect(row).toMatchObject({ name_given: 'Ali | Reza', name_family: 'Khan' });
  });

  it('has no column for the codings a cell cannot hold', () => {
    const [row] = toRows([observation({})], typed);

    expect(Object.keys(row ?? {})).not.toContain('code_codings');
  });

  it('serializes an element the shape does not declare rather than dropping it', () => {
    const [row] = toRows([observation({ acmeScore: { rank: 3, band: 'high' } })], typed);

    expect(row?.acmeScore_value).toBe('{"rank":3,"band":"high"}');
  });

  it('reports a value it cannot serialize as empty', () => {
    const unserializable: SimplifiedResource = {
      resourceType: 'Basic',
      id: 'b1',
      display: 'b1',
      fields: { odd: { kind: 'unknown', text: '—', value: () => 'not JSON' } },
      unmapped: ['odd'],
    };

    expect(toRows([unserializable], typed)[0]).toMatchObject({ odd: null, odd_value: null });
  });

  it('is a superset of the text projection', () => {
    const source = [bloodPressure, patient({ name: [{ family: 'Khan' }], active: true })];
    const plain = columnsOf(toRows(source));

    expect(columnsOf(toRows(source, typed))).toEqual(expect.arrayContaining(plain));
  });
});

describe('toRows — stable columns', () => {
  const mixed = [
    observation({ valueQuantity: { value: 74.5, unit: 'kg' } }),
    observation({ valueString: 'looks fine', bodySite: { text: 'Left arm' } }),
    patient({ name: [{ family: 'Khan' }] }),
  ];

  it('gives every row of a resource type the same keys, in the same order', () => {
    const [first, second] = toRows(mixed);

    expect(Object.keys(second ?? {})).toEqual(Object.keys(first ?? {}));
  });

  it('fills a value one row has and another does not with null', () => {
    const [first] = toRows(mixed);

    expect(first?.bodySite).toBeNull();
  });

  it('does not widen one resource type with the columns of another', () => {
    const [, , patientRow] = toRows(mixed);

    expect(Object.keys(patientRow ?? {})).not.toContain('bodySite');
    expect(patientRow).toMatchObject({ resourceType: 'Patient', name: 'Khan' });
  });

  it('keeps the resources in the order they arrived', () => {
    expect(toRows(mixed).map((row) => row.resourceType)).toEqual([
      'Observation',
      'Observation',
      'Patient',
    ]);
  });

  it('reports the columns for a header', () => {
    const rows = toRows(mixed.slice(0, 2));

    expect(columnsOf(rows)).toEqual(Object.keys(rows[0] ?? {}));
  });
});

describe('toTables', () => {
  it('returns one table per resource type', () => {
    const tables = toTables([
      observation({ valueString: 'a' }),
      patient({ name: [{ family: 'Khan' }] }),
      observation({ valueString: 'b' }),
    ]);

    expect(Object.keys(tables)).toEqual(['Observation', 'Patient']);
    expect(tables.Observation).toHaveLength(2);
    expect(tables.Patient).toHaveLength(1);
  });

  it('keeps each table to its own columns', () => {
    const tables = toTables([observation({ valueString: 'a' }), patient({ active: true })]);

    expect(columnsOf(tables.Patient ?? [])).not.toContain('value');
  });

  it('returns nothing for no resources', () => {
    expect(toTables([])).toEqual({});
  });
});

describe('toRows — through a CSV writer and back', () => {
  const quote = (cell: Cell): string =>
    cell === null ? '' : `"${String(cell).replaceAll('"', '""')}"`;

  const write = (rows: readonly Row[]): string => {
    const columns = columnsOf(rows);
    const body = rows.map((row) => columns.map((name) => quote(row[name] ?? null)).join(','));

    return [columns.join(','), ...body].join('\n');
  };

  const read = (csv: string): Row[] => {
    const [header = '', ...lines] = csv.split('\n');
    const columns = header.split(',');
    const cells = (line: string): Cell[] =>
      // Every non-empty cell is quoted, so the fields are unambiguous.
      (line.match(/(^|,)("(?:[^"]|"")*")?/g) ?? []).map((field) => {
        const value = field.replace(/^,/, '');
        return value === '' ? null : value.slice(1, -1).replaceAll('""', '"');
      });

    return lines.map((line) =>
      Object.fromEntries(cells(line).map((cell, index) => [columns[index] ?? '', cell])),
    );
  };

  /** What a CSV cell can hold: text, or nothing. */
  const asText = (rows: readonly Row[]): Row[] =>
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([name, cell]) => [name, cell === null ? null : String(cell)]),
      ),
    );

  const source = [
    bloodPressure,
    patient({ name: [{ family: 'O"Brien', given: ['Ali'] }], active: true }),
    observation({ valueString: 'has a , comma and a "quote"' }),
  ];

  it.each([CELL_MODE.TEXT, CELL_MODE.TYPED])(
    'produces the same cell values on the way back, in %s cells',
    (cells) => {
      // A table per file, and every cell of it survives the trip. Numbers come
      // back as their digits: a CSV has one type, and the value is intact.
      for (const rows of Object.values(toTables(source, { cells }))) {
        expect(read(write(rows))).toEqual(asText(rows));
      }
    },
  );

  it('writes one header the whole table fits', () => {
    const rows = toRows([observation({ valueString: 'a' }), observation({ valueBoolean: true })]);
    const widths = write(rows)
      .split('\n')
      .map((line) => line.split(',').length);

    expect(new Set(widths).size).toBe(1);
  });
});
