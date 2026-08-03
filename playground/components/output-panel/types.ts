import type { SimplifiedResource } from 'fhir-normalize';
import type { OutputTab, PlaygroundResult, ResourceSummary, ShapeFormat } from '@/types';

export interface OutputPanelProps {
  result: PlaygroundResult;
  summaries: readonly ResourceSummary[];
  normalized: readonly SimplifiedResource[];
  shapeText: string | null;
  shapeResourceType: string;
  onShapeResourceTypeChange: (resourceType: string) => void;
  shapeFormat: ShapeFormat;
  onShapeFormatChange: (format: ShapeFormat) => void;
  warnings: readonly string[];
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
}
