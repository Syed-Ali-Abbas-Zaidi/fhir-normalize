'use client';

import type { CellMode, ListMode } from 'fhir-normalize/simplified';
import { Check, Copy } from 'lucide-react';
import {
  NO_EXPLODE,
  NO_EXPLODE_LABEL,
  NO_ROWS_TEXT,
  ROW_CELL_OPTIONS,
  ROW_LIST_OPTIONS,
} from '@/constants';
import { useCopy } from '@/hooks';
import type { RowTable } from '@/types';
import { cellText, toCsv } from '@/utils';
import styles from './views.module.css';

interface RowsViewProps {
  tables: readonly RowTable[];
  lists: ListMode;
  onListsChange: (mode: ListMode) => void;
  cells: CellMode;
  onCellsChange: (mode: CellMode) => void;
  explode: string;
  onExplodeChange: (field: string) => void;
  explodable: readonly string[];
}

const EXPLODE_ID = 'rows-explode';

/** One resource type's table, with its own header and CSV. */
const Table = ({ table }: { table: RowTable }) => {
  const { copied, copy } = useCopy();

  return (
    <section className={styles.rowsTable}>
      <header className={styles.rowsTableHeader}>
        <span className={styles.dot} aria-hidden />
        <h3 className={styles.cardTitle}>{table.resourceType}</h3>
        <span className={styles.rowsMeta}>
          {table.rows.length} × {table.columns.length}
        </span>
        <button
          type="button"
          className={styles.rowsCopy}
          onClick={() => copy(toCsv(table))}
          aria-label={`Copy ${table.resourceType} as CSV`}
        >
          {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
          {copied ? 'copied' : 'csv'}
        </button>
      </header>

      <div className={styles.rowsScroll}>
        <table className={styles.grid}>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key}>
                {table.columns.map((column) => (
                  <td key={column}>{cellText(row.cells[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/**
 * The simplified view projected into flat records — what a CSV writer, a
 * dataframe, or an `INSERT` wants.
 *
 * The controls are the three decisions `toRows` exposes: what to do with
 * repeating elements, what to put in a cell, and which field to explode into
 * rows. Every column set here is stable per resource type, which is why each
 * table can be copied straight out as CSV.
 */
export const RowsView = ({
  tables,
  lists,
  onListsChange,
  cells,
  onCellsChange,
  explode,
  onExplodeChange,
  explodable,
}: RowsViewProps) => {
  if (tables.length === 0) return <p className={styles.clean}>{NO_ROWS_TEXT}</p>;

  return (
    <div className={styles.rows}>
      <div className={styles.shapeBar}>
        <span className={styles.shapeLabel}>lists</span>
        <div className={styles.rowsGroup}>
          {ROW_LIST_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.shapeFormat}
              aria-pressed={lists === option.value}
              onClick={() => onListsChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className={styles.shapeLabel}>cells</span>
        <div className={styles.rowsGroup}>
          {ROW_CELL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.shapeFormat}
              aria-pressed={cells === option.value}
              onClick={() => onCellsChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className={styles.shapeLabel} htmlFor={EXPLODE_ID}>
          explode
        </label>
        <select
          id={EXPLODE_ID}
          className={styles.shapeSelect}
          value={explode}
          onChange={(event) => onExplodeChange(event.target.value)}
        >
          <option value={NO_EXPLODE}>{NO_EXPLODE_LABEL}</option>
          {explodable.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.rowsTables}>
        {tables.map((table) => (
          <Table key={table.resourceType} table={table} />
        ))}
      </div>
    </div>
  );
};
