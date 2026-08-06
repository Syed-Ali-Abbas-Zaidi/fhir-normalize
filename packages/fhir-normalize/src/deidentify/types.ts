import type { DATE_POLICY, DEID_ACTION, FREE_TEXT_POLICY } from './constants';

export type DeIdentifyAction = (typeof DEID_ACTION)[keyof typeof DEID_ACTION];
export type DatePolicy = (typeof DATE_POLICY)[keyof typeof DATE_POLICY];
export type FreeTextPolicy = (typeof FREE_TEXT_POLICY)[keyof typeof FREE_TEXT_POLICY];

export interface DeIdentifyOptions {
  /**
   * What to do with dates. `year` keeps the year and drops month, day, and
   * time — enough for cohorting, not enough to pin an admission to a day.
   */
  dates?: DatePolicy;
  /**
   * What to do with free-text elements — notes, descriptions, conclusions.
   * Defaults to `redact`: prose written by a clinician routinely names the
   * patient, a relative, or a date, and no structural rule can find that
   * reliably. Set `keep` only when you have another control on that text.
   */
  freeText?: FreeTextPolicy;
  /**
   * Replace resource ids and references with stable surrogates so the graph
   * still resolves. Turning this off removes them instead, which usually makes
   * a Bundle useless.
   */
  pseudonymizeIds?: boolean;
  /**
   * Mixed into every surrogate. Two runs with different salts produce
   * different surrogates for the same input, so datasets cannot be joined.
   */
  salt?: string;
  /** Element names to leave alone, overriding the default policy. */
  keep?: readonly string[];
}

/** What the pass actually did, for auditing rather than reassurance. */
export interface DeIdentifyReport {
  redacted: number;
  pseudonymized: number;
  datesGeneralized: number;
  /** Distinct element names that were changed, sorted. */
  elements: string[];
}

export interface DeIdentifyResult {
  bundle: import('fhir/r4').Bundle;
  report: DeIdentifyReport;
}

/** What {@link deIdentifyResource} returns — one resource, and its own report. */
export interface DeIdentifyResourceResult {
  resource: import('fhir/r4').FhirResource;
  report: DeIdentifyReport;
}
