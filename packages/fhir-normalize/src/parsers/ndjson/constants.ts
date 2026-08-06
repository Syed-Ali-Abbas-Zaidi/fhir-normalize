/** How many leading lines {@link ndjsonParser.canParse} inspects. */
export const DETECTION_LINES = 2;

export const NDJSON_WARNING = {
  SKIPPED_LINES: (count: number, first: number): string =>
    `${count} line${count === 1 ? '' : 's'} were not valid JSON objects and were skipped, starting at line ${first}.`,
} as const;

/** Unrecoverable failures. These throw a `ParseError`. */
export const NDJSON_ERROR = {
  NOT_A_STRING: 'NDJSON input must be a string — one JSON resource per line.',
  NO_RESOURCES: 'No valid FHIR resources were found on any line.',
} as const;
