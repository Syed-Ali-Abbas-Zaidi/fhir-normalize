import type { FhirResource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import {
  createCollectionBundle,
  createDefaultNormalizer,
  createParseResult,
  createWarningLog,
  type FormatParser,
  fhirJsonParser,
  Normalizer,
  SOURCE_FORMAT,
  UnsupportedFormatError,
} from './index';
import { patientFixture } from './parsers/fhir-json/__fixtures__';

describe('createDefaultNormalizer', () => {
  it('registers every built-in parser, JSON first so the stricter check runs first', () => {
    expect(createDefaultNormalizer().formats).toEqual([
      SOURCE_FORMAT.FHIR_JSON,
      SOURCE_FORMAT.FHIR_XML,
    ]);
  });

  it.each([
    ['JSON', '{"resourceType":"Patient","id":"x"}', SOURCE_FORMAT.FHIR_JSON],
    ['XML', '<Patient><id value="x"/></Patient>', SOURCE_FORMAT.FHIR_XML],
  ])('routes %s to its own adapter', (_label, input, expected) => {
    expect(createDefaultNormalizer().detectFormat(input)).toBe(expected);
  });

  it('produces the same canonical shape from equivalent JSON and XML', () => {
    const normalizer = createDefaultNormalizer();
    const fromJson = normalizer.parse('{"resourceType":"Patient","id":"x","gender":"male"}');
    const fromXml = normalizer.parse('<Patient><id value="x"/><gender value="male"/></Patient>');

    expect(fromXml.bundle.entry).toEqual(fromJson.bundle.entry);
  });

  it('normalizes a resource end to end', () => {
    const { bundle, meta } = createDefaultNormalizer().parse(JSON.stringify(patientFixture));

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_JSON);
    expect(bundle.entry).toEqual([{ resource: patientFixture }]);
  });

  it('hands out an isolated registry per call, so importing has no shared state', () => {
    const first = createDefaultNormalizer();
    const second = createDefaultNormalizer();

    first.register({
      format: SOURCE_FORMAT.HL7V2,
      canParse: () => true,
      parse: () => {
        throw new Error('unused');
      },
    });

    expect(first.formats).toContain(SOURCE_FORMAT.HL7V2);
    expect(second.formats).not.toContain(SOURCE_FORMAT.HL7V2);
  });
});

describe('public surface', () => {
  it('lets a consumer assemble a Normalizer from the exported pieces', () => {
    const { meta } = new Normalizer().register(fhirJsonParser).parse(patientFixture);

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_JSON);
  });

  it('supports a custom adapter built only from exported helpers, with no core changes', () => {
    // The open/closed claim, exercised for real: a format the library does not
    // implement, added from outside the package with no changes to the core.
    const csvParser: FormatParser = {
      format: SOURCE_FORMAT.CSV,
      canParse: (raw) => typeof raw === 'string' && raw.startsWith('id,'),
      parse: (raw) => {
        const warnings = createWarningLog();
        warnings.add('CSV mapping only reads the id column.');

        const [, ...rows] = String(raw).trim().split('\n');
        const resources = rows.map<FhirResource>((id) => ({ resourceType: 'Patient', id }));

        return createParseResult({
          sourceFormat: SOURCE_FORMAT.CSV,
          bundle: createCollectionBundle(resources),
          warnings: warnings.list(),
        });
      },
    };

    const { bundle, meta } = createDefaultNormalizer().register(csvParser).parse('id,\na\nb');

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.CSV);
    expect(meta.warnings).toEqual(['CSV mapping only reads the id column.']);
    expect(bundle.entry).toEqual([
      { resource: { resourceType: 'Patient', id: 'a' } },
      { resource: { resourceType: 'Patient', id: 'b' } },
    ]);
  });

  it('reports unsupported input through the exported error class', () => {
    // Neither JSON nor XML claims a bare delimited record.
    expect(() => createDefaultNormalizer().parse('id,name\n1,Ali')).toThrow(UnsupportedFormatError);
  });
});
