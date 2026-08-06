import type { FhirResource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import {
  createCollectionBundle,
  createDefaultNormalizer,
  createParseResult,
  createWarningLog,
  DATE_POLICY,
  DEID_TRANSFORM_NAME,
  type FormatParser,
  fhirJsonParser,
  Normalizer,
  SOURCE_FORMAT,
  UnsupportedFormatError,
  VERSION_TRANSFORM_NAME,
} from './index';
import { patientFixture } from './parsers/fhir-json/__fixtures__';

describe('createDefaultNormalizer', () => {
  it('registers every built-in parser, JSON first so the stricter check runs first', () => {
    // Order is detection order. NDJSON goes last because a single JSON
    // resource is legitimately both formats, and FHIR JSON should keep it.
    expect(createDefaultNormalizer().formats).toEqual([
      SOURCE_FORMAT.FHIR_JSON,
      SOURCE_FORMAT.FHIR_XML,
      SOURCE_FORMAT.NDJSON,
    ]);
  });

  it.each([
    ['JSON', '{"resourceType":"Patient","id":"x"}', SOURCE_FORMAT.FHIR_JSON],
    ['XML', '<Patient><id value="x"/></Patient>', SOURCE_FORMAT.FHIR_XML],
    [
      'NDJSON',
      '{"resourceType":"Patient","id":"x"}\n{"resourceType":"Patient","id":"y"}',
      SOURCE_FORMAT.NDJSON,
    ],
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

describe('createDefaultNormalizer — cross-version', () => {
  it('runs the R4 version stage', () => {
    expect(createDefaultNormalizer().stages).toEqual([VERSION_TRANSFORM_NAME]);
  });

  it('normalizes STU3 XML all the way to R4, crossing both serialization and release', () => {
    const { bundle, meta } = createDefaultNormalizer().parse(
      `<Observation xmlns="http://hl7.org/fhir">
         <id value="obs-1"/>
         <status value="final"/>
         <context><reference value="Encounter/enc-1"/></context>
         <comment value="Taken after fasting."/>
       </Observation>`,
    );

    const resource = bundle.entry?.[0]?.resource as unknown as Record<string, unknown>;

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_XML);
    expect(resource.encounter).toEqual({ reference: 'Encounter/enc-1' });
    expect(resource.note).toEqual([{ text: 'Taken after fasting.' }]);
    expect(resource.context).toBeUndefined();
    expect(resource.comment).toBeUndefined();
  });

  it('reaches the same R4 resource from STU3 JSON and STU3 XML', () => {
    const normalizer = createDefaultNormalizer();
    const fromJson = normalizer.parse(
      '{"resourceType":"Observation","id":"o","status":"final","context":{"reference":"Encounter/e"}}',
    );
    const fromXml = normalizer.parse(
      '<Observation><id value="o"/><status value="final"/><context><reference value="Encounter/e"/></context></Observation>',
    );

    expect(fromXml.bundle.entry).toEqual(fromJson.bundle.entry);
  });

  it('can be assembled without the version stage when the source release matters', () => {
    const normalizer = new Normalizer().register(fhirJsonParser);
    const { bundle, meta } = normalizer.parse(
      '{"resourceType":"Patient","id":"p","animal":{"species":{"text":"Canine"}}}',
    );
    const resource = bundle.entry?.[0]?.resource as unknown as Record<string, unknown>;

    expect(normalizer.stages).toEqual([]);
    expect(resource.animal).toBeDefined();
    expect(meta.warnings).toEqual([]);
  });
});

describe('createDefaultNormalizer — de-identification', () => {
  const withNames =
    '{"resourceType":"Patient","id":"p1","name":[{"family":"Khan","given":["Ali"]}],"birthDate":"1996-04-12"}';

  it('is off unless asked for', () => {
    const { bundle } = createDefaultNormalizer().parse(withNames);

    expect(JSON.stringify(bundle)).toContain('Khan');
  });

  it.each([
    ['deIdentify: false', false],
    ['no options at all', undefined],
  ])('stays off for %s', (_label, deIdentify) => {
    const normalizer =
      deIdentify === undefined
        ? createDefaultNormalizer()
        : createDefaultNormalizer({ deIdentify });

    expect(normalizer.stages).not.toContain(DEID_TRANSFORM_NAME);
  });

  it('strips identifiers when passed `deIdentify: true`', () => {
    const { bundle, meta } = createDefaultNormalizer({ deIdentify: true }).parse(withNames);

    expect(JSON.stringify(bundle)).not.toContain('Khan');
    expect(meta.warnings.some((warning) => warning.includes('De-identified'))).toBe(true);
  });

  it('accepts an options object', () => {
    const { bundle } = createDefaultNormalizer({
      deIdentify: { dates: DATE_POLICY.KEEP },
    }).parse(withNames);

    expect(JSON.stringify(bundle)).toContain('1996-04-12');
    expect(JSON.stringify(bundle)).not.toContain('Khan');
  });

  it('runs after cross-version normalization, so it sees canonical R4', () => {
    const normalizer = createDefaultNormalizer({ deIdentify: true });

    expect(normalizer.stages).toEqual([VERSION_TRANSFORM_NAME, DEID_TRANSFORM_NAME]);
  });

  it('always states that it is not a certified anonymisation', () => {
    const { meta } = createDefaultNormalizer({ deIdentify: true }).parse(withNames);

    expect(meta.warnings.some((warning) => warning.includes('not a certified'))).toBe(true);
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
