import type { Normalizer } from '../core';

/**
 * Anything that yields the file a piece at a time.
 *
 * An async iterable rather than a Node `Readable`: a `Readable` already is one,
 * as is a web `ReadableStream` and an async generator, so this accepts all
 * three without the module knowing which runtime it is in.
 */
export type NdjsonSource = AsyncIterable<string | Uint8Array>;

export interface NdjsonStreamOptions {
  /**
   * Resources per emitted batch. Peak memory scales with this, not with the
   * size of the input.
   */
  batchSize?: number;

  /**
   * Whose post-parse stages to run over each batch — version migration,
   * de-identification, anything else registered.
   *
   * Omitted, no stages run and batches carry exactly what the file held. Pass
   * `createDefaultNormalizer()` to get the same treatment `parse()` gives a
   * string, which for a Bulk Data export from an STU3 server is the difference
   * between R4 out and R4-shaped-but-not out.
   */
  normalizer?: Normalizer;

  /** Longest line to assemble before giving up. See `DEFAULT_MAX_LINE_LENGTH`. */
  maxLineLength?: number;
}
