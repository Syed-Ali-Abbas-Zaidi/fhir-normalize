import { describe, expect, it, vi } from 'vitest';
import { createCollectionBundle } from './bundle';
import { SOURCE_FORMAT } from './constants';
import { UnsupportedFormatError } from './errors';
import { Normalizer } from './normalizer';
import { createParseResult } from './result';
import type { FormatParser, ResultTransform, SourceFormat } from './types';

/**
 * A parser that reports a fixed detection answer. The Normalizer only routes,
 * so a stub is enough to test it without dragging in a real format.
 */
const createStubParser = (format: SourceFormat, matches: boolean): FormatParser => ({
  format,
  canParse: vi.fn(() => matches),
  parse: vi.fn(() =>
    createParseResult({ sourceFormat: format, bundle: createCollectionBundle([]) }),
  ),
});

describe('Normalizer.register', () => {
  it('is chainable', () => {
    const normalizer = new Normalizer();

    expect(normalizer.register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true))).toBe(normalizer);
  });

  it('exposes registered formats in registration order', () => {
    const normalizer = new Normalizer()
      .register(createStubParser(SOURCE_FORMAT.FHIR_XML, false))
      .register(createStubParser(SOURCE_FORMAT.FHIR_JSON, false));

    expect(normalizer.formats).toEqual([SOURCE_FORMAT.FHIR_XML, SOURCE_FORMAT.FHIR_JSON]);
  });

  it('replaces rather than shadows when a format is registered twice', () => {
    const replacement = createStubParser(SOURCE_FORMAT.FHIR_JSON, true);
    const normalizer = new Normalizer()
      .register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true))
      .register(replacement);

    normalizer.parse('anything');

    expect(normalizer.formats).toEqual([SOURCE_FORMAT.FHIR_JSON]);
    expect(replacement.parse).toHaveBeenCalledOnce();
  });
});

describe('Normalizer.use', () => {
  /** Appends a warning so we can see whether, and in what order, it ran. */
  const createStubTransform = (name: string): ResultTransform => ({
    name,
    transform: vi.fn((result) => ({
      ...result,
      meta: { ...result.meta, warnings: [...result.meta.warnings, name] },
    })),
  });

  const parseWith = (...transforms: ResultTransform[]) =>
    transforms
      .reduce(
        (normalizer, transform) => normalizer.use(transform),
        new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true)),
      )
      .parse('anything');

  it('is chainable', () => {
    const normalizer = new Normalizer();

    expect(normalizer.use(createStubTransform('a'))).toBe(normalizer);
  });

  it('runs stages in registration order, after the parser', () => {
    expect(
      parseWith(createStubTransform('first'), createStubTransform('second')).meta.warnings,
    ).toEqual(['first', 'second']);
  });

  it('exposes stage names in the order they run', () => {
    const normalizer = new Normalizer()
      .use(createStubTransform('first'))
      .use(createStubTransform('second'));

    expect(normalizer.stages).toEqual(['first', 'second']);
  });

  it('replaces rather than shadows when a stage name is reused', () => {
    const replacement = createStubTransform('same');
    const normalizer = new Normalizer()
      .register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true))
      .use(createStubTransform('same'))
      .use(replacement);

    normalizer.parse('anything');

    expect(normalizer.stages).toEqual(['same']);
    expect(replacement.transform).toHaveBeenCalledOnce();
  });

  it('applies no stages by default', () => {
    const normalizer = new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true));

    expect(normalizer.stages).toEqual([]);
    expect(normalizer.parse('anything').meta.warnings).toEqual([]);
  });
});

describe('Normalizer.detectFormat', () => {
  it('returns the format of the first parser that matches', () => {
    const normalizer = new Normalizer()
      .register(createStubParser(SOURCE_FORMAT.FHIR_XML, false))
      .register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true));

    expect(normalizer.detectFormat('anything')).toBe(SOURCE_FORMAT.FHIR_JSON);
  });

  it('prefers the earlier registration when several match', () => {
    const normalizer = new Normalizer()
      .register(createStubParser(SOURCE_FORMAT.FHIR_XML, true))
      .register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true));

    expect(normalizer.detectFormat('anything')).toBe(SOURCE_FORMAT.FHIR_XML);
  });

  it('returns null when nothing matches', () => {
    const normalizer = new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, false));

    expect(normalizer.detectFormat('anything')).toBeNull();
  });

  it('returns null when no parser is registered', () => {
    expect(new Normalizer().detectFormat('anything')).toBeNull();
  });
});

describe('Normalizer.parse — routing', () => {
  it('delegates to the matching parser and returns its result untouched', () => {
    const parser = createStubParser(SOURCE_FORMAT.FHIR_JSON, true);
    const result = new Normalizer().register(parser).parse('anything');

    expect(parser.parse).toHaveBeenCalledWith('anything');
    expect(result.meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_JSON);
  });

  it('skips detection entirely when a format is given', () => {
    const parser = createStubParser(SOURCE_FORMAT.FHIR_XML, false);
    const normalizer = new Normalizer().register(parser);

    normalizer.parse('anything', SOURCE_FORMAT.FHIR_XML);

    expect(parser.parse).toHaveBeenCalledOnce();
    expect(parser.canParse).not.toHaveBeenCalled();
  });

  it('does not consult later parsers once one matches', () => {
    const first = createStubParser(SOURCE_FORMAT.FHIR_XML, true);
    const second = createStubParser(SOURCE_FORMAT.FHIR_JSON, true);

    new Normalizer().register(first).register(second).parse('anything');

    expect(second.canParse).not.toHaveBeenCalled();
  });
});

describe('Normalizer.parse — unsupported input', () => {
  it('throws when auto-detection finds no parser', () => {
    const normalizer = new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, false));

    expect(() => normalizer.parse('anything')).toThrow(UnsupportedFormatError);
    expect(() => normalizer.parse('anything')).toThrow(/Could not auto-detect/);
  });

  it('throws when the requested format has no parser', () => {
    const normalizer = new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true));

    expect(() => normalizer.parse('anything', SOURCE_FORMAT.HL7V2)).toThrow(UnsupportedFormatError);
  });

  it('lists the registered formats so the caller can see what went wrong', () => {
    const normalizer = new Normalizer().register(createStubParser(SOURCE_FORMAT.FHIR_JSON, true));

    expect(() => normalizer.parse('anything', SOURCE_FORMAT.CCDA)).toThrow(
      /Registered formats: fhir-json/,
    );
  });

  it('says "none" when the registry is empty', () => {
    expect(() => new Normalizer().parse('anything')).toThrow(/Registered formats: none/);
  });
});
