import type { ParseResult, SimplifiedResource, SourceFormat } from 'fhir-normalize';
import type { JSON_TOKEN, OUTPUT_TAB, PARSE_MODE, RESULT_STATE } from '@/constants';

export type ParseMode = (typeof PARSE_MODE)[keyof typeof PARSE_MODE];
export type OutputTab = (typeof OUTPUT_TAB)[keyof typeof OUTPUT_TAB];
export type JsonTokenKind = (typeof JSON_TOKEN)[keyof typeof JSON_TOKEN];

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
  warnings: string[];
}
