import type { SimplifiedResource } from 'fhir-normalize';
import type { OutputTab, PlaygroundResult, ResourceSummary } from '@/types';

export interface OutputPanelProps {
  result: PlaygroundResult;
  summaries: readonly ResourceSummary[];
  normalized: readonly SimplifiedResource[];
  shapeText: string | null;
  warnings: readonly string[];
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
}
