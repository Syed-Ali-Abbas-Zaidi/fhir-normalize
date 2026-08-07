import type { SimplifiedResource } from 'fhir-normalize';
import type { CellMode, ListMode } from 'fhir-normalize/simplified';
import type { OutputTab, PlaygroundResult, ResourceSummary, RowTable, ShapeFormat } from '@/types';

export interface OutputPanelProps {
  result: PlaygroundResult;
  summaries: readonly ResourceSummary[];
  normalized: readonly SimplifiedResource[];
  shapeText: string | null;
  shapeResourceType: string;
  onShapeResourceTypeChange: (resourceType: string) => void;
  shapeFormat: ShapeFormat;
  onShapeFormatChange: (format: ShapeFormat) => void;
  rowTables: readonly RowTable[];
  rowLists: ListMode;
  onRowListsChange: (mode: ListMode) => void;
  rowCells: CellMode;
  onRowCellsChange: (mode: CellMode) => void;
  rowExplode: string;
  onRowExplodeChange: (field: string) => void;
  explodableFields: readonly string[];
  warnings: readonly string[];
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
}
