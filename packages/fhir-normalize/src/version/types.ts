import type { UnknownRecord } from '../core';
import type { FHIR_VERSION } from './constants';

/** FHIR releases this library can normalize from. */
export type FhirVersion = (typeof FHIR_VERSION)[keyof typeof FHIR_VERSION];

/**
 * One field-level difference between a non-R4 release and R4.
 *
 * Migrations are data, not code paths: adding support for another difference
 * is a new row in the table, never a new branch in the transformer.
 *
 * Exactly one outcome applies, in this order:
 *  1. `rewrite` — the field becomes several R4 fields.
 *  2. `target`  — the field is renamed (and optionally converted).
 *  3. neither   — the field has no R4 equivalent and is dropped.
 */
export interface FieldMigration {
  /** The release this field belongs to. Reported in the warning. */
  readonly from: FhirVersion;
  /** Field name as it appears in the source release. */
  readonly source: string;
  /**
   * Guard for fields that exist in more than one release under the same name
   * but a different shape — `Encounter.class` is a Coding in R4 and a
   * CodeableConcept array in R5. Without this, an already-R4 payload would be
   * migrated a second time.
   */
  readonly applies?: (value: unknown) => boolean;
  /** The equivalent R4 field name. */
  readonly target?: string;
  /** Value conversion applied when writing to `target`. */
  readonly convert?: (value: unknown) => unknown;
  /** For a source field that maps onto more than one R4 field. */
  readonly rewrite?: (value: unknown) => UnknownRecord;
  /**
   * The R4 fields a `rewrite` can write, for rows where `target` cannot say it.
   *
   * A rewrite decides its own output keys, so nothing else can tell what it
   * writes — which left the conformance suite unable to check that those fields
   * exist in R4, or that a resource sharing this row's `source` also has
   * somewhere to put the result. `EpisodeOfCare.reason` is why it matters: R5
   * has the field and R4 has neither `reasonCode` nor `reasonReference`, so the
   * row that fits five other resources would have written elements R4 does not
   * define.
   */
  readonly writes?: readonly string[];
  /** Appended to the warning — used to spell out what was lost. */
  readonly reason?: string;
}

/** Migrations that apply to a resource type, keyed by `resourceType`. */
export type MigrationTable = Readonly<Record<string, readonly FieldMigration[]>>;
