import type {
  Cell,
  CellMode,
  ListMode,
  RowOptions,
  SimplifiedResource,
} from 'fhir-normalize/simplified';
import { columnsOf, toTables } from 'fhir-normalize/simplified';
import { EMPTY_CELL, NO_EXPLODE } from '@/constants';
import type { RowTable } from '@/types';

/**
 * The simplified view as tables — one per resource type, each with a stable
 * column set.
 *
 * The library returns rows and stops there, deliberately: quoting and encoding
 * belong to a CSV writer, not to a normalizer. So the page does the last step
 * itself, which is also the point being demonstrated.
 */
export const rowTables = (
  resources: readonly SimplifiedResource[],
  options: RowOptions,
): RowTable[] =>
  Object.entries(toTables(resources, options)).map(([resourceType, rows]) => ({
    resourceType,
    columns: columnsOf(rows),
    rows: rows.map((cells, position) => ({ key: `${resourceType}-${position}`, cells })),
  }));

/**
 * Repeating fields present in the parsed resources.
 *
 * Offering every field a shape *could* repeat would list dozens that this
 * payload does not have; reading them off the data keeps the picker to choices
 * that change what you see.
 */
export const explodableFields = (resources: readonly SimplifiedResource[]): string[] => {
  const fields = new Set<string>();

  for (const resource of resources) {
    for (const [field, value] of Object.entries(resource.fields)) {
      if (Array.isArray(value) && value.length > 0) fields.add(field);
    }
  }

  return [...fields].sort();
};

/** What a cell looks like in the table: no `null`, no `undefined`, just empty. */
export const cellText = (cell: Cell | undefined): string =>
  cell === null || cell === undefined ? EMPTY_CELL : String(cell);

/** RFC 4180: quote every field, and double a quote inside one. */
const quote = (cell: Cell | undefined): string =>
  cell === null || cell === undefined ? '' : `"${String(cell).replaceAll('"', '""')}"`;

/** One table as CSV text, header included — what the copy button hands over. */
export const toCsv = ({ columns, rows }: RowTable): string =>
  [
    columns.join(','),
    ...rows.map(({ cells }) => columns.map((column) => quote(cells[column])).join(',')),
  ].join('\n');

/** `NO_EXPLODE` is the picker's "off" entry, not a field name. */
export const rowOptionsFrom = (lists: ListMode, cells: CellMode, explode: string): RowOptions =>
  explode === NO_EXPLODE ? { lists, cells } : { lists, cells, explode };
