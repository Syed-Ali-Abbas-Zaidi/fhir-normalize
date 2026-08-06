/**
 * How many leading non-empty lines {@link ndjsonParser.canParse} inspects, and
 * how many of them must be resources for the input to count as NDJSON.
 *
 * A window rather than a prefix. Parsing tolerates a corrupt line, so
 * detection has to as well — requiring the first two lines to both be clean
 * meant one bad line near the top made the whole export undetectable, which is
 * exactly the case the leniency exists for.
 *
 * Two is the threshold because a single JSON resource is legitimately both
 * NDJSON and FHIR JSON, and the adapter that already handles it should keep it.
 */
export const DETECTION_WINDOW = 5;
export const DETECTION_REQUIRED = 2;

export const NDJSON_WARNING = {
  SKIPPED_LINES: (count: number, first: number): string =>
    count === 1
      ? `Line ${first} was not a valid JSON object and was skipped.`
      : `${count} lines were not valid JSON objects and were skipped, starting at line ${first}.`,
} as const;

/** Unrecoverable failures. These throw a `ParseError`. */
export const NDJSON_ERROR = {
  NOT_A_STRING: 'NDJSON input must be a string — one JSON resource per line.',
  NO_RESOURCES: 'No valid FHIR resources were found on any line.',
} as const;
