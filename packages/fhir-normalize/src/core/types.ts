import type { Bundle } from 'fhir/r4';
import type { BUNDLE_TYPE, SOURCE_FORMAT } from './constants';

/** Union of every supported input format, derived from the token const. */
export type SourceFormat = (typeof SOURCE_FORMAT)[keyof typeof SOURCE_FORMAT];

/** Union of every valid R4 `Bundle.type`, derived from the token const. */
export type BundleType = (typeof BUNDLE_TYPE)[keyof typeof BUNDLE_TYPE];

/** A plain JSON-ish object of unknown shape — what raw input decodes into. */
export type UnknownRecord = Record<string, unknown>;

/** Provenance and non-fatal mapping gaps for a single parse. */
export interface ParseMeta {
  /** Which adapter produced this result. */
  sourceFormat: SourceFormat;
  /** ISO-8601 timestamp of when the parse ran. */
  parsedAt: string;
  /** Recoverable issues. Never empty-checked by the library — surface them to users. */
  warnings: string[];
}

/** The one shape every parser produces, regardless of input format. */
export interface ParseResult {
  bundle: Bundle;
  meta: ParseMeta;
}

/**
 * The adapter contract — one implementation per input format (Strategy pattern).
 *
 * Implementations accept `unknown` at the boundary and narrow internally: raw
 * input is genuinely untrusted, so `TRaw` documents the intended shape without
 * pretending the caller has already validated it.
 */
export interface FormatParser<TRaw = unknown> {
  /** The format this adapter handles. Unique within a {@link Normalizer}. */
  readonly format: SourceFormat;
  /** Cheap, side-effect-free check used for auto-detection. Must not throw. */
  canParse(raw: unknown): boolean;
  /** Normalize the input to a canonical R4 Bundle. Throws only if unparseable. */
  parse(raw: TRaw): ParseResult;
}

/**
 * A post-parse stage, applied to every `ParseResult` regardless of which
 * adapter produced it.
 *
 * This is the seam for work that is not parsing — cross-version normalization
 * is the built-in case. Keeping it separate leaves `Normalizer` responsible
 * only for routing, and leaves parsers ignorant of anything but their format.
 */
export interface ResultTransform {
  /** Unique within a {@link Normalizer}. Re-using a name replaces the stage. */
  readonly name: string;
  transform(result: ParseResult): ParseResult;
}

/** Accumulates non-fatal warnings while a parser runs. */
export interface WarningLog {
  add(message: string): void;
  /** A copy, so the log cannot be mutated through the returned array. */
  list(): string[];
}

/** Input to the shared {@link createParseResult} factory. */
export interface CreateParseResultInput {
  sourceFormat: SourceFormat;
  bundle: Bundle;
  warnings?: string[];
}
