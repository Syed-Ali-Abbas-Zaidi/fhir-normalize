/**
 * Resources per emitted batch.
 *
 * The number trades peak memory against per-batch overhead, and 1,000 keeps a
 * batch of typical Observations in the low single-digit megabytes while making
 * the fixed cost of building a Bundle and running the stages irrelevant.
 */
export const DEFAULT_BATCH_SIZE = 1000;

/**
 * The longest single line the reader will assemble, in characters.
 *
 * Without a cap, a file with no newline in it accumulates in the carry buffer
 * and this module runs out of memory exactly the way `parse()` does — which
 * would make the whole exercise pointless. 32 MB is far above any real FHIR
 * resource, including a `DocumentReference` carrying inline base64, and far
 * below the 512 MB ceiling that makes a string impossible.
 */
export const DEFAULT_MAX_LINE_LENGTH = 32 * 1024 * 1024;

export const STREAM_ERROR = {
  NOT_ITERABLE: 'Expected an async iterable of strings or byte chunks.',
  NO_RESOURCES: 'The stream contained no lines that decode to a FHIR resource.',
  LINE_TOO_LONG: (limit: number, at: number): string =>
    `Line ${at} exceeds the ${limit} character limit without a newline. ` +
    'Raise maxLineLength if the input really is one enormous resource; ' +
    'otherwise the input is probably not newline-delimited JSON.',
} as const;

export const STREAM_WARNING = {
  SKIPPED_LINES: (count: number, firstLine: number): string =>
    `Skipped ${count} line${count === 1 ? '' : 's'} that did not decode to a FHIR resource, ` +
    `starting at line ${firstLine}.`,
} as const;
