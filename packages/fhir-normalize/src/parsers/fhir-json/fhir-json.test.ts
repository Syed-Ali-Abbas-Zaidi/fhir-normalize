import { describe, expect, it } from 'vitest';
import { BUNDLE_TYPE, ParseError, RESOURCE_TYPE, SOURCE_FORMAT } from '../../core';
import {
  bundleFixture,
  observationFixture,
  patientFixture,
  transactionBundleFixture,
} from './__fixtures__';
import { fhirJsonParser } from './index';

const json = (value: unknown): string => JSON.stringify(value);

const parse = (raw: unknown) => fhirJsonParser.parse(raw);

const resourcesOf = (raw: unknown) =>
  (parse(raw).bundle.entry ?? []).map((entry) => entry.resource);

describe('fhirJsonParser.canParse', () => {
  it.each([
    ['a resource object', patientFixture],
    ['a resource JSON string', json(patientFixture)],
    ['a Bundle JSON string', json(bundleFixture)],
    ['an array of resources', [patientFixture, observationFixture]],
    ['an array JSON string', json([patientFixture])],
    ['an empty array', []],
  ])('accepts %s', (_label, input) => {
    expect(fhirJsonParser.canParse(input)).toBe(true);
  });

  it.each([
    ['FHIR XML', '<Patient xmlns="http://hl7.org/fhir"><id value="x"/></Patient>'],
    ['an object without resourceType', { name: 'Ali' }],
    ['a JSON object string without resourceType', '{"name":"Ali"}'],
    ['an empty resourceType', { resourceType: '   ' }],
    ['malformed JSON', '{ not json'],
    ['a bare number', '42'],
    ['a bare string', '"hello"'],
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('rejects %s', (_label, input) => {
    expect(fhirJsonParser.canParse(input)).toBe(false);
  });

  it('never throws, whatever it is handed', () => {
    expect(() => fhirJsonParser.canParse(Symbol('nope'))).not.toThrow();
  });
});

describe('fhirJsonParser.parse — meta', () => {
  it('reports the source format', () => {
    expect(parse(patientFixture).meta.sourceFormat).toBe(SOURCE_FORMAT.FHIR_JSON);
  });

  it('stamps an ISO-8601 parsedAt', () => {
    const { parsedAt } = parse(patientFixture).meta;
    expect(parsedAt).toBe(new Date(parsedAt).toISOString());
  });
});

describe('fhirJsonParser.parse — clean input', () => {
  it('wraps a single resource in a collection Bundle', () => {
    const { bundle, meta } = parse(patientFixture);

    expect(bundle.resourceType).toBe(RESOURCE_TYPE.BUNDLE);
    expect(bundle.type).toBe(BUNDLE_TYPE.COLLECTION);
    expect(bundle.entry).toEqual([{ resource: patientFixture }]);
    expect(meta.warnings).toEqual([]);
  });

  it('produces the same Bundle from a string and from a pre-parsed object', () => {
    expect(parse(json(patientFixture)).bundle).toEqual(parse(patientFixture).bundle);
  });

  it('passes an existing Bundle through, preserving its entries and extra fields', () => {
    const { bundle, meta } = parse(bundleFixture);

    expect(bundle.id).toBe('bundle-1');
    expect(bundle.type).toBe(BUNDLE_TYPE.COLLECTION);
    expect(resourcesOf(bundleFixture)).toEqual([patientFixture, observationFixture]);
    expect(meta.warnings).toEqual([]);
  });

  it('preserves fields the library does not know about', () => {
    const withExtras = { ...patientFixture, someVendorExtension: { deep: ['value'] } };

    expect(resourcesOf(withExtras)).toEqual([withExtras]);
  });

  it('keeps request-only entries in a transaction bundle', () => {
    const { bundle, meta } = parse(transactionBundleFixture);

    expect(bundle.type).toBe(BUNDLE_TYPE.TRANSACTION);
    expect(bundle.entry).toEqual(transactionBundleFixture.entry);
    expect(meta.warnings).toHaveLength(1);
    expect(meta.warnings[0]).toMatch(/has no "resource"/);
  });
});

describe('fhirJsonParser.parse — warns instead of throwing', () => {
  it('flattens a root array into one collection Bundle', () => {
    const { bundle, meta } = parse([patientFixture, observationFixture]);

    expect(bundle.entry).toHaveLength(2);
    expect(meta.warnings[0]).toMatch(/Root was a JSON array/);
  });

  it('keeps a resource that has no resourceType, and says so', () => {
    const { bundle, meta } = parse('{"name":"Ali"}');

    expect(bundle.entry).toEqual([{ resource: { name: 'Ali' } }]);
    expect(meta.warnings[0]).toMatch(/has no "resourceType"/);
  });

  it.each([
    ['an unknown type code', 'not-a-real-type'],
    ['a missing type', undefined],
    ['a non-string type', 42],
  ])('defaults %s to a collection', (_label, type) => {
    const { bundle, meta } = parse({ resourceType: 'Bundle', type, entry: [] });

    expect(bundle.type).toBe(BUNDLE_TYPE.COLLECTION);
    expect(meta.warnings.some((warning) => warning.includes('not a valid R4 bundle type'))).toBe(
      true,
    );
  });

  it('normalizes a Bundle with no entry to an empty collection', () => {
    const { bundle, meta } = parse({ resourceType: 'Bundle', type: 'collection' });

    expect(bundle.entry).toEqual([]);
    expect(meta.warnings[0]).toMatch(/has no "entry"/);
  });

  it('normalizes a non-array entry to an empty collection', () => {
    const { bundle, meta } = parse({ resourceType: 'Bundle', type: 'collection', entry: {} });

    expect(bundle.entry).toEqual([]);
    expect(meta.warnings[0]).toMatch(/was not an array/);
  });

  it('drops non-object entries but keeps the good ones', () => {
    const { bundle, meta } = parse({
      resourceType: 'Bundle',
      type: 'collection',
      entry: ['nope', { resource: patientFixture }],
    });

    expect(bundle.entry).toEqual([{ resource: patientFixture }]);
    expect(meta.warnings[0]).toMatch(/Bundle entry \[0\] was not an object/);
  });

  it('drops an entry whose resource is not an object', () => {
    const { bundle, meta } = parse({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: 'nope' }],
    });

    expect(bundle.entry).toEqual([]);
    expect(meta.warnings[0]).toMatch(/Bundle entry resource \[0\] was not an object/);
  });

  it('reports every gap in a payload with several', () => {
    const { meta } = parse({
      resourceType: 'Bundle',
      type: 'bogus',
      entry: [{ resource: { id: 'no-type' } }, 'nope'],
    });

    expect(meta.warnings).toHaveLength(3);
  });
});

describe('fhirJsonParser.parse — throws only on unreadable input', () => {
  it('rejects malformed JSON', () => {
    expect(() => parse('{ not json')).toThrow(ParseError);
    expect(() => parse('{ not json')).toThrow(/not valid JSON/);
  });

  it('attaches the underlying syntax error as the cause', () => {
    expect(() => parse('{ not json')).toThrowError(
      expect.objectContaining({ cause: expect.any(SyntaxError) }),
    );
  });

  it('records which format rejected the input', () => {
    try {
      parse('{ not json');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).format).toBe(SOURCE_FORMAT.FHIR_JSON);
    }
  });

  it.each([
    ['a bare string', '"hello"'],
    ['a bare number', '42'],
    ['null', 'null'],
    ['a boolean', 'true'],
  ])('rejects %s as a root value', (_label, input) => {
    expect(() => parse(input)).toThrow(ParseError);
  });
});
