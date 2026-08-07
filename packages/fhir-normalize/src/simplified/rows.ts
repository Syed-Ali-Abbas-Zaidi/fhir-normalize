import { isRecord } from '../core';
import {
  CELL_LIST_SEPARATOR,
  CELL_MODE,
  COLUMN_SEPARATOR,
  COLUMN_SUFFIX,
  EMPTY_TEXT,
  IDENTITY_COLUMN,
  LIST_MODE,
  UNCELLED_PROPERTY,
} from './constants';
import type {
  Cell,
  CellMode,
  ListMode,
  NormalizedValue,
  Row,
  RowOptions,
  SimplifiedFields,
  SimplifiedResource,
} from './types';

/** One entry of a repeating element: a value, or a backbone element's fields. */
type Entry = NormalizedValue | SimplifiedFields;

/** Options with defaults applied, so the writers never re-derive them. */
interface Settings {
  lists: ListMode;
  cells: CellMode;
  /** `null` rather than absent — there is no field named "no field". */
  explode: string | null;
}

/** The entry of the exploded field this row is being built for. */
interface Exploded {
  field: string;
  entry: Entry;
  index: number;
  count: number;
}

const settle = (options: RowOptions): Settings => ({
  lists: options.lists ?? LIST_MODE.FIRST,
  cells: options.cells ?? CELL_MODE.TEXT,
  explode: options.explode ?? null,
});

/** `component`, `0`, `value` → `component_0_value`. */
const column = (...parts: (string | number)[]): string => parts.join(COLUMN_SEPARATOR);

/**
 * A normalized value, told apart from a backbone element's field map.
 *
 * Both are records, and a group can hold fields called `kind` or `text` —
 * `Observation.referenceRange.text` is one. Those hold normalized values
 * rather than strings, so checking the property *types* separates the two.
 */
const isNormalizedValue = (value: unknown): value is NormalizedValue =>
  isRecord(value) && typeof value.kind === 'string' && typeof value.text === 'string';

/** A scalar as itself; anything else as JSON, so an odd payload still lands. */
const rawCell = (value: unknown): Cell => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value === null || value === undefined) return null;

  return JSON.stringify(value) ?? null;
};

/**
 * The rendering, or `null`.
 *
 * A value carrying nothing displayable renders as an em-dash, which is a
 * display affordance: a table has a real empty cell where a page does not.
 */
const textCell = (value: NormalizedValue): Cell => (value.text === EMPTY_TEXT ? null : value.text);

/** A repeating primitive — `given`, `line` — joined into one cell. */
const listCell = (values: readonly unknown[]): Cell =>
  values.filter((item): item is string => typeof item === 'string').join(CELL_LIST_SEPARATOR) ||
  null;

const writeProperty = (row: Row, name: string, property: unknown): void => {
  // `Range.low` and `Ratio.numerator` are normalized values in their own
  // right, so they flatten by the same rules one level down.
  if (isNormalizedValue(property)) {
    writeTyped(row, name, property);
    return;
  }

  row[name] = Array.isArray(property) ? listCell(property) : rawCell(property);
};

/** The rendering, the kind, and every property the kind carries. */
const writeTyped = (row: Row, name: string, value: NormalizedValue): void => {
  row[name] = textCell(value);
  row[column(name, COLUMN_SUFFIX.KIND)] = value.kind;

  for (const [property, held] of Object.entries(value)) {
    if (UNCELLED_PROPERTY.has(property)) continue;
    writeProperty(row, column(name, property), held);
  }
};

const writeValue = (row: Row, name: string, value: NormalizedValue, settings: Settings): void => {
  if (settings.cells === CELL_MODE.TYPED) {
    writeTyped(row, name, value);
    return;
  }

  row[name] = textCell(value);
};

const writeEntry = (row: Row, name: string, entry: Entry, settings: Settings): void => {
  if (isNormalizedValue(entry)) {
    writeValue(row, name, entry, settings);
    return;
  }

  // A backbone element: its own fields, under the group's column prefix.
  writeFields(row, entry, settings, name);
};

const writeList = (row: Row, name: string, entries: readonly Entry[], settings: Settings): void => {
  if (settings.lists === LIST_MODE.INDEX) {
    for (const [index, entry] of entries.entries()) {
      writeEntry(row, column(name, index), entry, settings);
    }
    return;
  }

  // The count is what keeps the default honest: the row carries one entry, and
  // says so, rather than presenting a patient's third address as their only one.
  const [first] = entries;
  if (first !== undefined) writeEntry(row, name, first, settings);
  row[column(name, COLUMN_SUFFIX.COUNT)] = entries.length;
};

const writeFields = (
  row: Row,
  fields: SimplifiedFields,
  settings: Settings,
  prefix = '',
  exploded: Exploded | null = null,
): void => {
  for (const [field, value] of Object.entries(fields)) {
    const name = prefix === '' ? field : column(prefix, field);

    if (!Array.isArray(value)) {
      writeValue(row, name, value, settings);
      continue;
    }

    // Only the exploded field, and only at the top level: nested calls pass no
    // `exploded`, so a group inside the entry flattens like any other.
    if (exploded !== null && field === exploded.field) {
      writeEntry(row, name, exploded.entry, settings);
      row[column(name, COLUMN_SUFFIX.INDEX)] = exploded.index;
      row[column(name, COLUMN_SUFFIX.COUNT)] = exploded.count;
      continue;
    }

    writeList(row, name, value, settings);
  }
};

const buildRow = (
  resource: SimplifiedResource,
  settings: Settings,
  exploded: Exploded | null,
): Row => {
  const row: Row = {
    [IDENTITY_COLUMN.RESOURCE_TYPE]: resource.resourceType,
    [IDENTITY_COLUMN.ID]: resource.id,
    [IDENTITY_COLUMN.DISPLAY]: resource.display,
  };

  // Fields are written after the identity columns and win a collision: an
  // element genuinely named `display` is the resource's own data, and an
  // overwritten key keeps its position, so the column set is unaffected.
  writeFields(row, resource.fields, settings, '', exploded);

  return row;
};

/** One row, or one per entry of the exploded field. */
const rowsFor = (resource: SimplifiedResource, settings: Settings): Row[] => {
  const { explode } = settings;
  const field = explode === null ? undefined : resource.fields[explode];
  const entries: readonly Entry[] = Array.isArray(field) ? field : [];

  // A resource without the field still gets its row: dropping it would make
  // the table's contents depend on which field the caller chose to explode.
  if (explode === null || entries.length === 0) return [buildRow(resource, settings, null)];

  return entries.map((entry, index) =>
    buildRow(resource, settings, { field: explode, entry, index, count: entries.length }),
  );
};

/**
 * Every column any of the rows uses, in the order they were first seen.
 *
 * The header for a CSV writer, and the column list for a `CREATE TABLE`. Rows
 * from {@link toRows} already carry all of them, so this is only needed when
 * the writer wants the header separately from the data.
 */
export const columnsOf = (rows: readonly Row[]): string[] => {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const name of Object.keys(row)) {
      if (seen.has(name)) continue;
      seen.add(name);
      columns.push(name);
    }
  }

  return columns;
};

/** Rebuilds each row with every column, in one order, missing values as `null`. */
const fill = (rows: readonly Row[], columns: readonly string[]): Row[] =>
  rows.map((row) => Object.fromEntries(columns.map((name) => [name, row[name] ?? null])));

/** What one resource produced, kept together so input order survives grouping. */
interface Built {
  resourceType: string;
  rows: Row[];
}

const group = (built: readonly Built[]): Map<string, Built[]> => {
  const groups = new Map<string, Built[]>();

  for (const item of built) {
    const items = groups.get(item.resourceType);
    if (items === undefined) groups.set(item.resourceType, [item]);
    else items.push(item);
  }

  return groups;
};

/**
 * Project the simplified view into flat records.
 *
 * The simplified view has already done the hard part — choice elements
 * resolved onto one key, datatypes flattened to a fixed shape, every value
 * carrying a rendering — so this is the mechanical last step: one row per
 * resource, one column per field, and cells a CSV writer or a database driver
 * takes as they are.
 *
 * Columns are stable **per resource type**, not across the whole result: a
 * Bundle mixes Patients and Observations, and one table spanning both is
 * mostly empty cells. Every Observation row therefore carries the same keys in
 * the same order as every other Observation row, with `null` where a value is
 * absent, and input order is preserved. {@link toTables} returns them grouped.
 *
 * Nothing here emits CSV text. Quoting, escaping, and encoding are solved
 * problems, and rows hand off to whichever library already solved them.
 *
 * @param resources The output of `simplifyBundle`, or of `simplifyResource`.
 * @param options Repeating-element treatment, cell contents, and explosion.
 */
export const toRows = (
  resources: readonly SimplifiedResource[],
  options: RowOptions = {},
): Row[] => {
  const settings = settle(options);
  const built: Built[] = resources.map((resource) => ({
    resourceType: resource.resourceType,
    rows: rowsFor(resource, settings),
  }));

  // Stabilizing needs every row of a type, so it happens once they all exist.
  // The groups hold the same objects `built` does, so filling them leaves the
  // input order alone.
  for (const items of group(built).values()) {
    const columns = columnsOf(items.flatMap((item) => item.rows));
    for (const item of items) item.rows = fill(item.rows, columns);
  }

  return built.flatMap((item) => item.rows);
};

/**
 * The same rows, grouped into one table per resource type.
 *
 * What a relational load wants: `Patient` and `Observation` are different
 * grains with different columns, and a table each keeps both narrow.
 */
export const toTables = (
  resources: readonly SimplifiedResource[],
  options: RowOptions = {},
): Record<string, Row[]> => {
  const tables: Record<string, Row[]> = {};

  for (const row of toRows(resources, options)) {
    const resourceType = String(row[IDENTITY_COLUMN.RESOURCE_TYPE]);
    const table = tables[resourceType] ?? [];

    table.push(row);
    tables[resourceType] = table;
  }

  return tables;
};
