import type { FhirResource } from 'fhir/r4';
import {
  createCollectionBundle,
  createParseResult,
  createWarningLog,
  type FormatParser,
  isNonEmptyString,
  isRecord,
  ParseError,
  type ParseResult,
  SOURCE_FORMAT,
} from '../../core';
import { DETECTION_LINES, NDJSON_ERROR, NDJSON_WARNING } from './constants';

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

/**
 * The first `limit` non-empty lines.
 *
 * Read by scanning for newlines rather than splitting: detection may be handed
 * an entire Bulk Data export, and `split('\n')` on a 500MB string would
 * allocate the whole file as an array to look at two lines.
 */
const leadingLines = (text: string, limit: number): string[] => {
  const lines: string[] = [];
  let from = 0;

  while (lines.length < limit && from < text.length) {
    const newline = text.indexOf('\n', from);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(from, end).trim();

    if (line.length > 0) lines.push(line);
    if (newline === -1) break;
    from = newline + 1;
  }

  return lines;
};

/**
 * Adapter for newline-delimited JSON — the format FHIR Bulk Data (`$export`)
 * returns: one resource per line, no enclosing array or Bundle.
 *
 * Detection requires two or more resource lines. A single JSON object is
 * legitimately both NDJSON and FHIR JSON, and treating it as NDJSON would take
 * work away from the adapter that already handles it.
 *
 * Parsing is lenient once the caller has committed: a line that is not a JSON
 * resource is skipped and reported, because one corrupt line in a
 * hundred-thousand-line export should not lose the other 99,999.
 */
export const ndjsonParser: FormatParser = {
  format: SOURCE_FORMAT.NDJSON,

  canParse(raw: unknown): boolean {
    if (typeof raw !== 'string') return false;

    const lines = leadingLines(raw, DETECTION_LINES);
    return lines.length === DETECTION_LINES && lines.every((line) => decodeResource(line) !== null);
  },

  parse(raw: unknown): ParseResult {
    if (typeof raw !== 'string')
      throw new ParseError(SOURCE_FORMAT.NDJSON, NDJSON_ERROR.NOT_A_STRING);

    const warnings = createWarningLog();
    const resources: FhirResource[] = [];
    let skipped = 0;
    let firstSkipped = 0;

    // Tracked separately from the array index: a warning that points at line
    // 4,001 of the input is useful, and one that points at resource 4,001 is
    // not the same number once lines have been skipped.
    let lineNumber = 0;

    for (const line of raw.split('\n')) {
      lineNumber += 1;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const resource = decodeResource(trimmed);
      if (resource === null) {
        skipped += 1;
        if (firstSkipped === 0) firstSkipped = lineNumber;
        continue;
      }

      resources.push(resource);
    }

    if (resources.length === 0)
      throw new ParseError(SOURCE_FORMAT.NDJSON, NDJSON_ERROR.NO_RESOURCES);
    if (skipped > 0) warnings.add(NDJSON_WARNING.SKIPPED_LINES(skipped, firstSkipped));

    return createParseResult({
      sourceFormat: SOURCE_FORMAT.NDJSON,
      bundle: createCollectionBundle(resources),
      warnings: warnings.list(),
    });
  },
};
