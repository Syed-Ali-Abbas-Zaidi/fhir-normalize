import { ERROR_MESSAGE } from './constants';
import { UnsupportedFormatError } from './errors';
import type { FormatParser, ParseResult, SourceFormat } from './types';

/**
 * Routes raw input to the parser that can handle it, and nothing else.
 *
 * It depends only on the {@link FormatParser} interface, never on a concrete
 * adapter, so supporting a new format is a `register()` call rather than an
 * edit to this class.
 */
export class Normalizer {
  /**
   * Keyed by format so registering the same format twice replaces rather than
   * shadows. Insertion order is preserved, and it doubles as detection
   * priority: the first parser whose `canParse` matches wins.
   */
  private readonly parsers = new Map<SourceFormat, FormatParser>();

  /** Formats currently registered, in detection order. */
  get formats(): SourceFormat[] {
    return [...this.parsers.keys()];
  }

  /** Add (or replace) the adapter for a format. Chainable. */
  register(parser: FormatParser): this {
    this.parsers.set(parser.format, parser);
    return this;
  }

  /**
   * The format that would be used for this input, or `null` if none matches.
   * Detection only — it does not parse.
   */
  detectFormat(raw: unknown): SourceFormat | null {
    return this.findParser(raw)?.format ?? null;
  }

  /**
   * Normalize input into a canonical R4 Bundle.
   *
   * @param raw    The input, in any registered format.
   * @param format Skip auto-detection and use this adapter.
   * @throws {UnsupportedFormatError} No adapter matched, or `format` is unregistered.
   */
  parse(raw: unknown, format?: SourceFormat): ParseResult {
    const parser = format === undefined ? this.findParser(raw) : this.parsers.get(format);

    if (!parser) {
      throw new UnsupportedFormatError(
        format === undefined
          ? ERROR_MESSAGE.UNDETECTABLE_FORMAT(this.formats)
          : ERROR_MESSAGE.NO_PARSER_REGISTERED(format, this.formats),
      );
    }

    return parser.parse(raw);
  }

  private findParser(raw: unknown): FormatParser | undefined {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(raw)) return parser;
    }
    return undefined;
  }
}
