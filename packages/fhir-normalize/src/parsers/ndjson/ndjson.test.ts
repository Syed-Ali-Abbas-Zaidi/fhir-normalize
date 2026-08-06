import { describe, expect, it } from 'vitest';
import { createDefaultNormalizer } from '../..';
import { ParseError, SOURCE_FORMAT } from '../../core';
import { ndjsonParser } from './index';

const line = (id: string, extra: object = {}) =>
  JSON.stringify({ resourceType: 'Observation', id, status: 'final', ...extra });

const ndjson = (...ids: string[]) => ids.map((id) => line(id)).join('\n');

describe('ndjsonParser.canParse', () => {
  it('claims two or more JSON resources on separate lines', () => {
    expect(ndjsonParser.canParse(ndjson('a', 'b'))).toBe(true);
  });

  it('leaves a single resource to the FHIR JSON adapter', () => {
    // Legitimately both formats; the adapter that already handles it keeps it.
    expect(ndjsonParser.canParse(line('a'))).toBe(false);
  });

  it('does not claim pretty-printed FHIR JSON', () => {
    // The giveaway is that a line of a pretty-printed document — `{`, or
    // `"id": "a",` — is not itself a JSON object.
    const pretty = JSON.stringify({ resourceType: 'Patient', id: 'a' }, null, 2);

    expect(pretty.split('\n').length).toBeGreaterThan(2);
    expect(ndjsonParser.canParse(pretty)).toBe(false);
  });

  it('does not claim a JSON array of resources', () => {
    expect(ndjsonParser.canParse(JSON.stringify([{ resourceType: 'Patient' }], null, 2))).toBe(
      false,
    );
  });

  it('rejects lines without a resourceType', () => {
    expect(ndjsonParser.canParse('{"a":1}\n{"b":2}')).toBe(false);
  });

  it.each([[42], [null], [{ resourceType: 'Patient' }], ['']])(
    'rejects non-string input: %s',
    (raw) => {
      expect(ndjsonParser.canParse(raw)).toBe(false);
    },
  );

  it('tolerates blank lines and trailing newlines', () => {
    expect(ndjsonParser.canParse(`${line('a')}\n\n${line('b')}\n`)).toBe(true);
  });

  it.each([
    ['first', ['bad', line('b'), line('c')]],
    ['second', [line('a'), 'bad', line('c')]],
    ['first two', ['bad', 'bad', line('c'), line('d')]],
  ])('still detects when the %s line is corrupt', (_where, lines) => {
    // Parsing skips a corrupt line, so detection has to survive one too —
    // otherwise a single bad line near the top makes the whole export
    // undetectable, which is the case the leniency exists for.
    expect(ndjsonParser.canParse(lines.join('\n'))).toBe(true);
  });

  it('needs two resources within the window, not just one', () => {
    // A single resource followed by junk is not NDJSON — one resource is
    // FHIR JSON, and this keeps the adapters from fighting over it.
    expect(ndjsonParser.canParse([line('a'), 'bad', 'bad', 'bad', 'bad'].join('\n'))).toBe(false);
  });
});

describe('ndjsonParser.parse', () => {
  it('reads every line into one collection Bundle', () => {
    const { bundle, meta } = ndjsonParser.parse(ndjson('a', 'b', 'c'));

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.NDJSON);
    expect(bundle.type).toBe('collection');
    expect(bundle.entry?.map((e) => e.resource?.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips a corrupt line rather than losing the rest', () => {
    // One bad line in a hundred-thousand-line export must not fail the export.
    const { bundle, meta } = ndjsonParser.parse(`${line('a')}\nnot json\n${line('c')}`);

    expect(bundle.entry).toHaveLength(2);
    expect(meta.warnings[0]).toContain('1 line');
    expect(meta.warnings[0]).toContain('line 2');
  });

  it('counts skipped lines by input line, not by resource', () => {
    const { meta } = ndjsonParser.parse(`${line('a')}\nbad\nbad\n${line('d')}`);

    expect(meta.warnings[0]).toContain('2 lines');
    expect(meta.warnings[0]).toContain('starting at line 2');
  });

  it('says nothing when every line was good', () => {
    expect(ndjsonParser.parse(ndjson('a', 'b')).meta.warnings).toEqual([]);
  });

  it('throws when no line yields a resource', () => {
    expect(() => ndjsonParser.parse('nope\nalso nope')).toThrow(ParseError);
  });

  it('throws on non-string input', () => {
    expect(() => ndjsonParser.parse(42)).toThrow(ParseError);
  });
});

describe('NDJSON through the default normalizer', () => {
  it('is detected without naming the format', () => {
    expect(createDefaultNormalizer().detectFormat(ndjson('a', 'b'))).toBe(SOURCE_FORMAT.NDJSON);
  });

  it('still routes a single JSON resource to the FHIR JSON adapter', () => {
    expect(createDefaultNormalizer().detectFormat(line('a'))).toBe(SOURCE_FORMAT.FHIR_JSON);
  });

  it('detects and parses an export whose second line is corrupt', () => {
    // End to end, through detection rather than by calling the adapter — the
    // path that 1.12.0 got wrong.
    const raw = [line('a'), 'corrupt line', line('c')].join('\n');
    const { bundle, meta } = createDefaultNormalizer().parse(raw);

    expect(meta.sourceFormat).toBe(SOURCE_FORMAT.NDJSON);
    expect(bundle.entry).toHaveLength(2);
    expect(meta.warnings.some((w) => w.includes('skipped'))).toBe(true);
  });

  it('runs the cross-version stage over every line', () => {
    // `context` is the STU3 spelling of `encounter`.
    const raw = [
      JSON.stringify({ resourceType: 'Observation', id: 'a', status: 'final' }),
      JSON.stringify({
        resourceType: 'Observation',
        id: 'b',
        status: 'final',
        context: { reference: 'Encounter/e' },
      }),
    ].join('\n');

    const { bundle, meta } = createDefaultNormalizer().parse(raw);
    const [, second] = bundle.entry ?? [];

    expect(second?.resource).toMatchObject({ encounter: { reference: 'Encounter/e' } });
    expect(second?.resource).not.toHaveProperty('context');
    expect(meta.warnings.some((w) => w.includes('context'))).toBe(true);
  });
});
