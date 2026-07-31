import {
  createParseResult,
  createWarningLog,
  type FormatParser,
  type ParseResult,
  SOURCE_FORMAT,
} from '../../core';
import { decodeXml, toBundle } from './utils';

/**
 * Adapter for FHIR XML.
 *
 * Detection is a cheap "starts with `<`" check rather than a full parse: input
 * that looks like XML but is broken should reach this parser and get a specific
 * `ParseError`, not fall through as an undetectable format.
 *
 * The mapping is structural — element name to `resourceType`, `value`
 * attributes to primitives, nested `<resource>` unwrapped — plus the type and
 * cardinality inference XML cannot express on its own. Every parse reports that
 * inference in `meta.warnings`.
 */
export const fhirXmlParser: FormatParser = {
  format: SOURCE_FORMAT.FHIR_XML,

  canParse(raw: unknown): boolean {
    return typeof raw === 'string' && raw.trimStart().startsWith('<');
  },

  parse(raw: unknown): ParseResult {
    const warnings = createWarningLog();
    const bundle = toBundle(decodeXml(raw), warnings);

    return createParseResult({
      sourceFormat: SOURCE_FORMAT.FHIR_XML,
      bundle,
      warnings: warnings.list(),
    });
  },
};
