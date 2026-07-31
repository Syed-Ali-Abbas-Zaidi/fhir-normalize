import type { SourceFormat } from 'fhir-normalize';

export interface StageBadge {
  text: string;
  empty: boolean;
}

export interface StageProps {
  label: string;
  badge?: StageBadge;
  active?: boolean;
  /** The last stage, emphasised as the destination. */
  terminal?: boolean;
  icon?: boolean;
}

export interface PipelineStripProps {
  detectedFormat: SourceFormat | null;
  normalized: boolean;
}
