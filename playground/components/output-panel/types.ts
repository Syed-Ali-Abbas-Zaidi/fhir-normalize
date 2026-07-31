import type { OutputTab, PlaygroundResult, ResourceSummary } from '@/types';

export interface OutputPanelProps {
  result: PlaygroundResult;
  summaries: readonly ResourceSummary[];
  warnings: readonly string[];
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
}
