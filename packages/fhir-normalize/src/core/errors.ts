import { ERROR_NAME } from './constants';
import type { SourceFormat } from './types';

/**
 * Base class for everything this library throws, so consumers can catch one
 * type instead of enumerating subclasses.
 */
export class FhirNormalizeError extends Error {}

/** No parser could handle the input — either none matched, or the requested format is unregistered. */
export class UnsupportedFormatError extends FhirNormalizeError {
  constructor(message: string) {
    super(message);
    this.name = ERROR_NAME.UNSUPPORTED_FORMAT;
  }
}

/**
 * The input was routed to a parser but is genuinely unreadable — malformed
 * JSON, unbalanced XML. Recoverable gaps become warnings instead (see
 * {@link ParseMeta.warnings}); this is only for input that cannot be decoded.
 */
export class ParseError extends FhirNormalizeError {
  /** The parser that rejected the input. */
  readonly format: SourceFormat;

  constructor(format: SourceFormat, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = ERROR_NAME.PARSE;
    this.format = format;
  }
}
