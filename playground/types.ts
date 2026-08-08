import type { ParseResult, SimplifiedResource, SourceFormat } from 'fhir-normalize';
import type { Cell, CellMode, ListMode } from 'fhir-normalize/simplified';
import type {
  JSON_TOKEN,
  OUTPUT_TAB,
  PARSE_MODE,
  RESULT_STATE,
  SHAPE_FORMAT,
  THEME,
} from '@/constants';

export type ParseMode = (typeof PARSE_MODE)[keyof typeof PARSE_MODE];
export type OutputTab = (typeof OUTPUT_TAB)[keyof typeof OUTPUT_TAB];
export type JsonTokenKind = (typeof JSON_TOKEN)[keyof typeof JSON_TOKEN];
export type ShapeFormat = (typeof SHAPE_FORMAT)[keyof typeof SHAPE_FORMAT];

/** What the user picked. */
export type Theme = (typeof THEME)[keyof typeof THEME];

/** What that resolves to — the only values `data-theme` is ever set to. */
export type ResolvedTheme = Exclude<Theme, typeof THEME.SYSTEM>;

export interface ThemeOption {
  value: Theme;
  label: string;
}

export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/** One section of the resource list, for the shape picker. */
export interface ShapeGroup {
  label: string;
  resourceTypes: string[];
}

/** A plain object of unknown shape — what parsed resources look like here. */
export type UnknownRecord = Record<string, unknown>;

export interface JsonToken {
  /** Character offset in the serialized JSON — a stable identity for rendering. */
  offset: number;
  text: string;
  kind: JsonTokenKind;
}

export interface ModeOption {
  value: ParseMode;
  label: string;
}

export interface RowListOption {
  value: ListMode;
  label: string;
}

export interface RowCellOption {
  value: CellMode;
  label: string;
}

/**
 * One projected row, with a rendering identity.
 *
 * Rows have no id of their own — two exploded components of one Observation
 * differ only by position — so the key is assigned where the table is built,
 * the same way {@link ResourceSummary} does it.
 */
export interface RenderRow {
  key: string;
  cells: Record<string, Cell>;
}

/** One resource type's table, ready to render: a header and its rows. */
export interface RowTable {
  resourceType: string;
  columns: string[];
  rows: readonly RenderRow[];
}

export interface TabConfig {
  value: OutputTab;
  label: string;
}

export interface SampleConfig {
  label: string;
  payload: string;
  /** Why this sample is worth clicking. */
  hint: string;
}

/**
 * The three states the output panel can be in. Modelled as a discriminated
 * union so the panel cannot read `bundle` off a failed parse.
 */
export type PlaygroundResult =
  | { state: typeof RESULT_STATE.EMPTY }
  | ({ state: typeof RESULT_STATE.OK } & ParseResult)
  | { state: typeof RESULT_STATE.ERROR; name: string; message: string };

/** One label/value row in an extracted resource card. */
export interface SummaryField {
  label: string;
  value: string;
}

export interface ResourceSummary {
  /** Identity for rendering: the resource id when it has one, else its position. */
  key: string;
  type: string;
  fields: SummaryField[];
}

export interface PlaygroundState {
  input: string;
  setInput: (value: string) => void;
  mode: ParseMode;
  setMode: (mode: ParseMode) => void;
  tab: OutputTab;
  setTab: (tab: OutputTab) => void;
  detectedFormat: SourceFormat | null;
  result: PlaygroundResult;
  summaries: ResourceSummary[];
  /** The simplified view — choice types resolved, datatypes flattened. */
  normalized: SimplifiedResource[];
  /** Whether direct identifiers are stripped before display. */
  deIdentify: boolean;
  setDeIdentify: (value: boolean) => void;
  /** The resource type the Shape tab is describing. */
  shapeResourceType: string;
  setShapeResourceType: (resourceType: string) => void;
  shapeFormat: ShapeFormat;
  setShapeFormat: (format: ShapeFormat) => void;
  /** The rendered structure for `shapeResourceType`. */
  shapeText: string | null;
  /** The simplified view projected into flat records, a table per resource type. */
  rowTables: RowTable[];
  rowLists: ListMode;
  setRowLists: (mode: ListMode) => void;
  rowCells: CellMode;
  setRowCells: (mode: CellMode) => void;
  /** The field being exploded into rows, or `NO_EXPLODE` for none. */
  rowExplode: string;
  setRowExplode: (field: string) => void;
  /** Repeating fields the parsed resources actually carry, for the picker. */
  explodableFields: string[];
  warnings: string[];
}
