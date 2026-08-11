/**
 * Streaming ingestion, for input too large to be a string.
 *
 * Kept on its own subpath so nobody who parses a payload in memory pays for it,
 * and because it is the only part of the library that is asynchronous.
 */
export {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_LINE_LENGTH,
  STREAM_ERROR,
  STREAM_WARNING,
} from './constants';
export { parseNdjsonStream } from './ndjson';
export type { NdjsonSource, NdjsonStreamOptions } from './types';
