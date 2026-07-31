import type { Observation, Patient } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { BUNDLE_TYPE, ParseError, RESOURCE_TYPE, SOURCE_FORMAT } from '../../core';
import {
  bundleXml,
  containedXml,
  emptyResourceContainerXml,
  extensionXml,
  malformedXml,
  narrativeXml,
  observationXml,
  patientWithLeadingZeroXml,
  patientWithTwoGivenNamesXml,
  patientXml,
  singleEntryBundleXml,
} from './__fixtures__';
import { fhirXmlParser } from './index';

const parse = (raw: unknown) => fhirXmlParser.parse(raw);

const firstResource = <T>(raw: unknown): T => {
  const [entry] = parse(raw).bundle.entry ?? [];
  return entry?.resource as T;
};

describe('fhirXmlParser.canParse', () => {
  it.each([
    ['an XML document', patientXml],
    ['a document with a declaration', bundleXml],
    ['leading whitespace', '   \n<Patient/>'],
    ['malformed but XML-looking input', malformedXml],
  ])('accepts %s', (_label, input) => {
    expect(fhirXmlParser.canParse(input)).toBe(true);
  });

  it.each([
    ['JSON', '{"resourceType":"Patient"}'],
    ['a parsed object', { resourceType: 'Patient' }],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, input) => {
    expect(fhirXmlParser.canParse(input)).toBe(false);
  });

  it('claims malformed XML so the caller gets a specific error, not "undetectable"', () => {
    expect(fhirXmlParser.canParse(malformedXml)).toBe(true);
    expect(() => parse(malformedXml)).toThrow(ParseError);
  });
});

describe('fhirXmlParser.parse — structural mapping', () => {
  it('turns the root element name into resourceType', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(patient.resourceType).toBe('Patient');
    expect(patient.id).toBe('example-xml');
  });

  it('unwraps value attributes into primitives', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(patient.gender).toBe('female');
    expect(patient.birthDate).toBe('1991-11-03');
  });

  it('wraps a lone resource in a collection Bundle', () => {
    const { bundle } = parse(patientXml);

    expect(bundle.resourceType).toBe(RESOURCE_TYPE.BUNDLE);
    expect(bundle.type).toBe(BUNDLE_TYPE.COLLECTION);
    expect(bundle.entry).toHaveLength(1);
  });

  it('unwraps the extra <resource> level that XML adds inside a Bundle entry', () => {
    const { bundle } = parse(bundleXml);

    expect(bundle.entry?.map((entry) => entry.resource?.resourceType)).toEqual([
      'Patient',
      'Observation',
    ]);
    expect(bundle.entry?.[0]?.resource?.id).toBe('p1');
  });

  it('keeps a single-entry Bundle as an array', () => {
    const { bundle } = parse(singleEntryBundleXml);

    expect(bundle.type).toBe(BUNDLE_TYPE.SEARCHSET);
    expect(bundle.entry).toHaveLength(1);
  });

  it('preserves the XHTML narrative as a string rather than parsing it into nodes', () => {
    const patient = firstResource<Patient>(narrativeXml);

    expect(patient.text?.status).toBe('generated');
    expect(patient.text?.div).toBe('<p>Sara <b>Ahmed</b></p>');
  });

  it('maps an extension url attribute onto a url property', () => {
    const patient = firstResource<Patient>(extensionXml);

    expect(patient.extension).toEqual([
      { url: 'http://example.org/fhir/StructureDefinition/age', valueInteger: 42 },
    ]);
  });

  it('unwraps contained resources and keeps them as a list', () => {
    const observation = firstResource<Observation>(containedXml);

    expect(observation.contained).toEqual([{ resourceType: 'Patient', id: 'inline' }]);
  });

  it('drops the xmlns declaration', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(Object.keys(patient)).not.toContain('xmlns');
  });
});

describe('fhirXmlParser.parse — cardinality inference', () => {
  it('arrays a known repeating element that occurs once', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(Array.isArray(patient.name)).toBe(true);
    expect(patient.name?.[0]?.family).toBe('Ahmed');
  });

  it('arrays repeating primitives even when they occur once', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(patient.name?.[0]?.given).toEqual(['Sara']);
  });

  it('keeps genuinely repeated elements as one array, not nested', () => {
    const patient = firstResource<Patient>(patientWithTwoGivenNamesXml);

    expect(patient.name?.[0]?.given).toEqual(['Sara', 'Jane']);
  });

  it('leaves non-repeating complex elements scalar', () => {
    const observation = firstResource<Observation>(observationXml);

    expect(Array.isArray(observation.subject)).toBe(false);
    expect(observation.subject?.reference).toBe('Patient/example-1');
  });
});

describe('fhirXmlParser.parse — primitive typing', () => {
  it('types a Quantity magnitude as a number', () => {
    const observation = firstResource<Observation>(observationXml);

    expect(observation.valueQuantity?.value).toBe(74.5);
    expect(observation.valueQuantity?.unit).toBe('kg');
  });

  it('types value[x] suffixes from the element name', () => {
    const patient = firstResource<Patient>(extensionXml);

    expect(patient.extension?.[0]?.valueInteger).toBe(42);
  });

  it('types known boolean elements', () => {
    expect(firstResource<Patient>(patientXml).active).toBe(true);
  });

  it('types Bundle.total as a number', () => {
    expect(parse(bundleXml).bundle.total).toBe(2);
  });

  it('leaves a leading-zero postal code as a string', () => {
    const patient = firstResource<Patient>(patientWithLeadingZeroXml);

    expect(patient.address?.[0]?.postalCode).toBe('02134');
  });

  it('leaves dates and codes as strings', () => {
    const patient = firstResource<Patient>(patientXml);

    expect(patient.birthDate).toBe('1991-11-03');
    expect(patient.gender).toBe('female');
  });
});

describe('fhirXmlParser.parse — warnings', () => {
  it('always reports that the mapping is inferred', () => {
    expect(parse(patientXml).meta.warnings[0]).toMatch(/carries no schema/);
  });

  it('reports the source format', () => {
    expect(parse(patientXml).meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_XML);
  });

  it('warns and drops an entry whose resource container is empty', () => {
    const { bundle, meta } = parse(emptyResourceContainerXml);

    expect(bundle.entry).toEqual([]);
    expect(meta.warnings.some((warning) => warning.includes('holds no resource element'))).toBe(
      true,
    );
    expect(meta.warnings.some((warning) => warning.includes('carries no fields at all'))).toBe(
      true,
    );
  });

  it('warns when a container holds more than one resource', () => {
    const { meta } = parse(
      '<Bundle><type value="collection"/><entry><resource><Patient/><Observation/></resource></entry></Bundle>',
    );

    expect(
      meta.warnings.some((warning) => warning.includes('where exactly one resource was expected')),
    ).toBe(true);
  });
});

describe('fhirXmlParser.parse — throws only on unreadable input', () => {
  it('rejects malformed XML with the underlying detail', () => {
    expect(() => parse(malformedXml)).toThrow(ParseError);
    expect(() => parse(malformedXml)).toThrow(/not well-formed XML/);
  });

  it('rejects non-string input', () => {
    expect(() => parse({ resourceType: 'Patient' })).toThrow(/must be a string/);
  });

  it('records which format rejected the input', () => {
    try {
      parse(malformedXml);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ParseError).format).toBe(SOURCE_FORMAT.FHIR_XML);
    }
  });

  it('rejects a declaration with no root element', () => {
    // Caught by XML validation before the root guard is reached.
    expect(() => parse('<?xml version="1.0"?>')).toThrow(/not well-formed XML/);
  });

  it('rejects a document with two root elements', () => {
    expect(() => parse('<Patient/><Observation/>')).toThrow(ParseError);
  });
});
