import type { CreateParseResultInput, ParseResult } from './types';

/**
 * The single place a {@link ParseResult} is constructed. Every parser goes
 * through it, so `meta` can never drift between adapters.
 */
export const createParseResult = ({
  sourceFormat,
  bundle,
  warnings = [],
}: CreateParseResultInput): ParseResult => ({
  bundle,
  meta: {
    sourceFormat,
    parsedAt: new Date().toISOString(),
    warnings,
  },
});
