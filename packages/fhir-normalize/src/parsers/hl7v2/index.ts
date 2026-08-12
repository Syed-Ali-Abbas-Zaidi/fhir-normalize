import {
  createParseResult,
  createWarningLog,
  type FormatParser,
  type ParseResult,
  SOURCE_FORMAT,
} from '../../core';
import { HEADER_SEGMENT } from './constants';
import { decodeMessage, toBundle } from './utils';

/**
 * Adapter for HL7 v2 pipe-delimited messages.
 *
 * Detection is "starts with `MSH` and a delimiter", which no other format this
 * library reads can look like. Broken input that starts that way reaches this
 * parser and gets a specific `ParseError` rather than falling through as an
 * undetectable format.
 *
 * **The mapping is a curated subset, not the v2-to-FHIR implementation guide.**
 * PID, PV1, OBX, AL1 and DG1 become Patient, Encounter, Observation,
 * AllergyIntolerance and Condition; every other segment is skipped and named in
 * `meta.warnings`. That covers the substance of an ADT or ORU message, which is
 * what most interfaces send, and nothing more. Where v2 says something R4
 * cannot express — a timestamp with no UTC offset, a code with no R4
 * counterpart — the element is left out and the loss reported, rather than
 * guessed at.
 *
 * Not registered by default: import it and register it, the way XML works.
 *
 * ```ts
 * import { createDefaultNormalizer } from 'fhir-normalize';
 * import { hl7v2Parser } from 'fhir-normalize/hl7v2';
 *
 * const normalizer = createDefaultNormalizer().register(hl7v2Parser);
 * ```
 */
export const hl7v2Parser: FormatParser = {
  format: SOURCE_FORMAT.HL7V2,

  canParse(raw: unknown): boolean {
    if (typeof raw !== 'string') return false;
    const start = raw.trimStart();

    // A delimiter must follow, so a document merely beginning with the letters
    // MSH is not mistaken for a message.
    return start.startsWith(HEADER_SEGMENT) && /^MSH[^A-Za-z0-9\s]/.test(start);
  },

  parse(raw: unknown): ParseResult {
    const warnings = createWarningLog();
    const bundle = toBundle(decodeMessage(raw), warnings);

    return createParseResult({
      sourceFormat: SOURCE_FORMAT.HL7V2,
      bundle,
      warnings: warnings.list(),
    });
  },
};

export { decodeMessage } from './lexer';
export type { Delimiters, Message, Segment } from './types';
