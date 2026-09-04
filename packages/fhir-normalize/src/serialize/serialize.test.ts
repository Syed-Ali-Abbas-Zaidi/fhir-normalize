import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { createCollectionBundle, FhirNormalizeError } from '../core';
import { createDefaultNormalizer } from '../index';
import { UNTYPED_GROUP } from './constants';
import { toNdjson, toNdjsonByType } from './ndjson';

const bundleOf = (...resources: object[]) =>
  createCollectionBundle(resources as never[]) as unknown as Bundle;

const lines = (ndjson: string) => ndjson.split('\n').filter((line) => line !== '');

describe('toNdjson', () => {
  it('writes one line per resource and nothing else', () => {
    const ndjson = toNdjson(
      bundleOf(
        { resourceType: 'Patient', id: 'p1' },
        { resourceType: 'Observation', id: 'o1', status: 'final' },
      ),
    );

    expect(lines(ndjson)).toEqual([
      '{"resourceType":"Patient","id":"p1"}',
      '{"resourceType":"Observation","id":"o1","status":"final"}',
    ]);
  });

  /*
   * The property the format rests on. A resource carrying prose with newlines
   * in it — a discharge summary, a narrative — must still occupy one line, or
   * splitting on `\n` tears it in half and every reader breaks.
   */
  it('keeps a resource on one line however much prose it carries', () => {
    const ndjson = toNdjson(
      bundleOf({
        resourceType: 'DocumentReference',
        id: 'd1',
        description: 'line one\nline two\r\nline three line four',
      }),
    );

    expect(lines(ndjson)).toHaveLength(1);
    // And it survives the trip, rather than being one line because it was
    // truncated.
    expect(JSON.parse(lines(ndjson)[0] as string).description).toBe(
      'line one\nline two\r\nline three line four',
    );
  });

  it('ends every line, including the last, so files concatenate', () => {
    const first = toNdjson(bundleOf({ resourceType: 'Patient', id: 'p1' }));
    const second = toNdjson(bundleOf({ resourceType: 'Patient', id: 'p2' }));

    expect(first.endsWith('\n')).toBe(true);
    expect(lines(first + second)).toHaveLength(2);
  });

  it('does not write the Bundle wrapper', () => {
    // NDJSON carries resources. Writing the Bundle would make `parse()` on the
    // output produce a Bundle nested inside another one.
    const ndjson = toNdjson(bundleOf({ resourceType: 'Patient', id: 'p1' }));

    expect(ndjson).not.toContain('"resourceType":"Bundle"');
  });

  it('gives an empty string for a Bundle with nothing in it', () => {
    expect(toNdjson({ resourceType: 'Bundle', type: 'collection' } as Bundle)).toBe('');
    expect(toNdjson(bundleOf())).toBe('');
  });

  it('skips an entry that carries no resource', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ fullUrl: 'urn:uuid:1' }, { resource: { resourceType: 'Patient', id: 'p1' } }],
    } as unknown as Bundle;

    expect(lines(toNdjson(bundle))).toHaveLength(1);
  });

  it('names the resource when one will not serialize', () => {
    const circular: Record<string, unknown> = { resourceType: 'Patient', id: 'p1' };
    circular.self = circular;

    // Impossible from `parse()`, which builds from JSON; reachable from code.
    expect(() => toNdjson(bundleOf({ resourceType: 'Patient', id: 'ok' }, circular))).toThrow(
      FhirNormalizeError,
    );
    expect(() => toNdjson(bundleOf(circular))).toThrow(/Patient \[0\] cannot be written as JSON/);
  });
});

describe('toNdjson round-trips through parse', () => {
  /*
   * The claim worth testing: what this writes, this library reads back. It is
   * also the pitch — a v2 message in, a Bulk Data export out.
   */
  it('reads back as the same resources', () => {
    const normalizer = createDefaultNormalizer();
    const source = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p1', name: [{ family: 'Doe' }] } },
        {
          resource: {
            resourceType: 'Observation',
            id: 'o1',
            status: 'final',
            code: { text: 'Body Weight' },
            valueQuantity: { value: 74.5, unit: 'kg' },
          },
        },
      ],
    });

    const first = normalizer.parse(source).bundle;
    const second = normalizer.parse(toNdjson(first));

    expect(second.meta.sourceFormat).toBe('ndjson');
    expect(second.bundle.entry?.map((entry) => entry.resource)).toEqual(
      first.entry?.map((entry) => entry.resource),
    );
  });

  it('needs two resources to be detected as NDJSON, which is the adapter talking', () => {
    // A single line is legitimately both NDJSON and FHIR JSON, and the JSON
    // adapter claims it first. The resource is the same either way.
    const normalizer = createDefaultNormalizer();
    const one = toNdjson(bundleOf({ resourceType: 'Patient', id: 'p1' }));

    expect(normalizer.parse(one).meta.sourceFormat).toBe('fhir-json');
    expect(normalizer.parse(one).bundle.entry).toHaveLength(1);
  });
});

describe('toNdjsonByType', () => {
  it('groups into one document per resource type, keyed by the filename', () => {
    const groups = toNdjsonByType(
      bundleOf(
        { resourceType: 'Patient', id: 'p1' },
        { resourceType: 'Observation', id: 'o1', status: 'final' },
        { resourceType: 'Observation', id: 'o2', status: 'final' },
      ),
    );

    expect(Object.keys(groups).sort()).toEqual(['Observation', 'Patient']);
    expect(lines(groups.Observation as string)).toHaveLength(2);
    expect(lines(groups.Patient as string)).toHaveLength(1);
  });

  it('keeps a resource that never had a resourceType rather than dropping it', () => {
    // `parse()` produces these: a root object with no `resourceType` is kept
    // and reported. Losing it here would undo that.
    const groups = toNdjsonByType(bundleOf({ name: 'Ali' }, { resourceType: 'Patient', id: 'p1' }));

    expect(Object.keys(groups).sort()).toEqual(['Patient', UNTYPED_GROUP]);
    expect(lines(groups[UNTYPED_GROUP] as string)).toEqual(['{"name":"Ali"}']);
  });

  it('writes the same lines toNdjson does, only sorted into files', () => {
    const bundle = bundleOf(
      { resourceType: 'Patient', id: 'p1' },
      { resourceType: 'Observation', id: 'o1', status: 'final' },
      { resourceType: 'Patient', id: 'p2' },
    );

    const flat = lines(toNdjson(bundle)).sort();
    const grouped = Object.values(toNdjsonByType(bundle)).flatMap(lines).sort();

    expect(grouped).toEqual(flat);
  });
});
