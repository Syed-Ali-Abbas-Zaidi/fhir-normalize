import type { FhirResource } from 'fhir/r4';
import {
  createCollectionBundle,
  createParseResult,
  createWarningLog,
  isNonEmptyString,
  isRecord,
  ParseError,
  type ParseResult,
  SOURCE_FORMAT,
} from '../core';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_LINE_LENGTH,
  STREAM_ERROR,
  STREAM_WARNING,
} from './constants';
import type { NdjsonSource, NdjsonStreamOptions } from './types';

/**
 * `TextDecoder` is a WHATWG global — present in Node 11+, Deno, Bun and every
 * browser — but its types live in TypeScript's DOM library, which this package
 * deliberately does not include: pulling DOM in would put `window`, `document`
 * and `fetch` in scope for a library that must never reach for any of them, and
 * lose a compile-time guard worth more than this convenience.
 *
 * So the two members actually used are declared here. Module-scoped, so it
 * cannot conflict with a consumer whose own configuration does include DOM.
 */
declare const TextDecoder: {
  new (
    label?: string,
  ): {
    decode(input?: Uint8Array, options?: { stream?: boolean }): string;
  };
};

/** A JSON object carrying a `resourceType`, or `null` if the line is not one. */
const decodeResource = (line: string): FhirResource | null => {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) && isNonEmptyString(value.resourceType)
      ? (value as unknown as FhirResource)
      : null;
  } catch {
    return null;
  }
};

/** What one batch has accumulated, including the lines it could not read. */
interface Batch {
  resources: FhirResource[];
  skipped: number;
  firstSkippedLine: number;
}

const emptyBatch = (): Batch => ({ resources: [], skipped: 0, firstSkippedLine: 0 });

/**
 * Read the file a piece at a time and hand back a normal `ParseResult` every
 * `batchSize` resources.
 *
 * ### Why this exists
 *
 * `parse()` takes the whole input as one string, and a string cannot exceed
 * 512 MB — above that it cannot be constructed at all, whatever the heap is
 * set to. Well below that it is still expensive: 250 MB of NDJSON measured at
 * roughly 1.15 GB resident, because the source text, the array of lines and
 * the decoded resources are all live at once. A Bulk Data `$export` from a real
 * server passes both marks routinely, which made "supports Bulk Data" true of a
 * test file and false of the thing the format exists for.
 *
 * Here nothing but the current batch is retained, so peak memory follows
 * `batchSize` and not the size of the file.
 *
 * ### Why batches and not resources
 *
 * Each yield is exactly what `parse()` returns — a canonical R4 `Bundle` plus
 * `meta` — so everything downstream keeps working: `simplifyBundle`,
 * `validateBundle`, and the registered stages, which operate on a
 * `ParseResult` and would otherwise have to be skipped. The promise the library
 * makes is a Bundle; this keeps it, and makes it repeatedly.
 *
 * ### Warnings
 *
 * A line that does not decode is skipped and reported, the same bargain the
 * non-streaming adapter makes: one corrupt line should not cost the other
 * 99,999. Counts are per batch and line numbers count from the start of the
 * file, so a warning points at somewhere `sed -n 'Np'` will find.
 *
 * @throws {ParseError} The source is not async-iterable, no line in the entire
 *   stream decoded to a resource, or a single line exceeded `maxLineLength`.
 *
 * @example
 * ```ts
 * import { createReadStream } from 'node:fs';
 * import { createDefaultNormalizer } from 'fhir-normalize';
 * import { parseNdjsonStream } from 'fhir-normalize/stream';
 *
 * const source = createReadStream('export.ndjson');
 * const options = { batchSize: 1000, normalizer: createDefaultNormalizer() };
 *
 * for await (const { bundle, meta } of parseNdjsonStream(source, options)) {
 *   await db.insertMany(bundle.entry ?? []);
 *   if (meta.warnings.length > 0) console.warn(meta.warnings);
 * }
 * ```
 */
export async function* parseNdjsonStream(
  source: NdjsonSource,
  options: NdjsonStreamOptions = {},
): AsyncGenerator<ParseResult, void, undefined> {
  if (!isRecord(source) || typeof source[Symbol.asyncIterator] !== 'function') {
    throw new ParseError(SOURCE_FORMAT.NDJSON, STREAM_ERROR.NOT_ITERABLE);
  }

  const {
    batchSize = DEFAULT_BATCH_SIZE,
    normalizer,
    maxLineLength = DEFAULT_MAX_LINE_LENGTH,
  } = options;

  // `stream: true` is the whole point: a chunk boundary lands mid-character
  // often enough at these sizes, and decoding each chunk independently would
  // corrupt every multi-byte character that straddled one.
  const decoder = new TextDecoder('utf-8');

  let carry = '';
  let lineNumber = 0;
  let total = 0;
  let batch = emptyBatch();

  const result = (current: Batch): ParseResult => {
    const warnings = createWarningLog();
    if (current.skipped > 0) {
      warnings.add(STREAM_WARNING.SKIPPED_LINES(current.skipped, current.firstSkippedLine));
    }

    const parsed = createParseResult({
      sourceFormat: SOURCE_FORMAT.NDJSON,
      bundle: createCollectionBundle(current.resources),
      warnings: warnings.list(),
    });

    return normalizer === undefined ? parsed : normalizer.applyTransforms(parsed);
  };

  const take = (line: string): void => {
    lineNumber += 1;

    // Before `trim` and before `JSON.parse`, because the limit is about what
    // this module is willing to hold and decode, not only about what it will
    // accumulate. Checked only after a chunk boundary, a line that arrives
    // complete and oversized inside one chunk would be parsed anyway, and
    // `JSON.parse` on it is the memory spike the limit exists to prevent.
    if (line.length > maxLineLength) {
      throw new ParseError(
        SOURCE_FORMAT.NDJSON,
        STREAM_ERROR.LINE_TOO_LONG(maxLineLength, lineNumber),
      );
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    const resource = decodeResource(trimmed);
    if (resource === null) {
      batch.skipped += 1;
      if (batch.firstSkippedLine === 0) batch.firstSkippedLine = lineNumber;
      return;
    }

    batch.resources.push(resource);
    total += 1;
  };

  for await (const chunk of source) {
    carry += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

    let from = 0;
    let newline = carry.indexOf('\n', from);

    while (newline !== -1) {
      take(carry.slice(from, newline));
      from = newline + 1;
      newline = carry.indexOf('\n', from);

      if (batch.resources.length >= batchSize) {
        yield result(batch);
        batch = emptyBatch();
      }
    }

    carry = carry.slice(from);

    // The other half of the same limit: a line still being assembled has no
    // newline yet, so `take` cannot have rejected it.
    if (carry.length > maxLineLength) {
      throw new ParseError(
        SOURCE_FORMAT.NDJSON,
        STREAM_ERROR.LINE_TOO_LONG(maxLineLength, lineNumber + 1),
      );
    }
  }

  // Flush whatever the decoder was holding, then the last line, which a file
  // that does not end in a newline still owes us.
  carry += decoder.decode();
  if (carry.length > 0) take(carry);

  if (total === 0) throw new ParseError(SOURCE_FORMAT.NDJSON, STREAM_ERROR.NO_RESOURCES);

  // A trailing batch with no resources but a skipped line still has something
  // to report; one with neither does not.
  if (batch.resources.length > 0 || batch.skipped > 0) yield result(batch);
}
