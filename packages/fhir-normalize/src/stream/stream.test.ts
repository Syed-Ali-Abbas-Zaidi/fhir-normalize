import { describe, expect, it } from 'vitest';
import { Normalizer, type ParseResult } from '../core';
import { createDefaultNormalizer } from '../index';
import { fhirJsonParser } from '../parsers/fhir-json';
import { DEFAULT_BATCH_SIZE } from './constants';
import { parseNdjsonStream } from './ndjson';
import type { NdjsonSource } from './types';

const observation = (index: number) =>
  JSON.stringify({
    resourceType: 'Observation',
    id: `obs-${index}`,
    status: 'final',
    valueQuantity: { value: index, unit: 'kg' },
  });

/** A source that hands over exactly the chunks given, in order. */
const chunks = (...pieces: (string | Uint8Array)[]): NdjsonSource => ({
  async *[Symbol.asyncIterator]() {
    for (const piece of pieces) yield piece;
  },
});

/** One string, cut into fixed-size pieces, so boundaries land anywhere. */
const sliced = (text: string, size: number): NdjsonSource => {
  const pieces: string[] = [];
  for (let at = 0; at < text.length; at += size) pieces.push(text.slice(at, at + size));
  return chunks(...pieces);
};

const collect = async (source: NdjsonSource, options = {}) => {
  const batches = [];
  for await (const batch of parseNdjsonStream(source, options)) batches.push(batch);
  return batches;
};

const idsOf = (batches: readonly ParseResult[]) =>
  batches.flatMap((batch) =>
    (batch.bundle.entry ?? []).map((entry) => (entry.resource as { id: string } | undefined)?.id),
  );

describe('parseNdjsonStream — batching', () => {
  it('yields one batch per batchSize resources, and a partial last one', async () => {
    const text = Array.from({ length: 250 }, (_, i) => observation(i)).join('\n');
    const batches = await collect(chunks(text), { batchSize: 100 });

    expect(batches.map((b) => b.bundle.entry?.length)).toEqual([100, 100, 50]);
    expect(idsOf(batches)).toHaveLength(250);
  });

  it('emits an exact multiple without a trailing empty batch', async () => {
    const text = Array.from({ length: 200 }, (_, i) => observation(i)).join('\n');
    const batches = await collect(chunks(text), { batchSize: 100 });

    expect(batches).toHaveLength(2);
  });

  it('defaults to DEFAULT_BATCH_SIZE', async () => {
    const text = Array.from({ length: DEFAULT_BATCH_SIZE + 1 }, (_, i) => observation(i)).join(
      '\n',
    );
    const batches = await collect(chunks(text));

    expect(batches.map((b) => b.bundle.entry?.length)).toEqual([DEFAULT_BATCH_SIZE, 1]);
  });

  it('every batch is a real ParseResult, not a partial one', async () => {
    const [batch] = await collect(chunks(observation(1)));

    expect(batch?.bundle.resourceType).toBe('Bundle');
    expect(batch?.bundle.type).toBe('collection');
    expect(batch?.meta.sourceFormat).toBe('ndjson');
    expect(Array.isArray(batch?.meta.warnings)).toBe(true);
  });
});

describe('parseNdjsonStream — chunk boundaries', () => {
  /*
   * The reason this module exists is that the file arrives in pieces, so a
   * boundary landing anywhere at all must not change the answer.
   */
  it('reassembles lines split across chunks, at every possible offset', async () => {
    const text = Array.from({ length: 12 }, (_, i) => observation(i)).join('\n');
    const expected = idsOf(await collect(chunks(text)));

    for (let size = 1; size <= 64; size += 1) {
      expect(idsOf(await collect(sliced(text, size)))).toEqual(expected);
    }
  });

  it('does not corrupt a multi-byte character split across a byte chunk', async () => {
    const resource = JSON.stringify({
      resourceType: 'Patient',
      id: 'p1',
      name: [{ text: 'Ali Khan — 日本語 🏥' }],
    });
    const bytes = new TextEncoder().encode(`${resource}\n`);

    // Cut at every byte offset; several land inside the 3- and 4-byte sequences.
    for (let at = 1; at < bytes.length; at += 1) {
      const [batch] = await collect(chunks(bytes.slice(0, at), bytes.slice(at)));
      const [entry] = batch?.bundle.entry ?? [];

      const name = (entry?.resource as { name?: { text: string }[] } | undefined)?.name;
      expect(name?.[0]?.text).toBe('Ali Khan — 日本語 🏥');
    }
  });

  it('reads the last line of a file that does not end in a newline', async () => {
    const batches = await collect(chunks(`${observation(1)}\n${observation(2)}`));

    expect(idsOf(batches)).toEqual(['obs-1', 'obs-2']);
  });

  it('handles CRLF endings and blank lines', async () => {
    const batches = await collect(chunks(`${observation(1)}\r\n\r\n${observation(2)}\r\n`));

    expect(idsOf(batches)).toEqual(['obs-1', 'obs-2']);
  });
});

describe('parseNdjsonStream — bad lines', () => {
  it('skips a line that does not decode and reports where it started', async () => {
    const batches = await collect(
      chunks([observation(1), 'not json at all', observation(2)].join('\n')),
    );

    expect(idsOf(batches)).toEqual(['obs-1', 'obs-2']);
    expect(batches[0]?.meta.warnings.join()).toContain('Skipped 1 line');
    expect(batches[0]?.meta.warnings.join()).toContain('line 2');
  });

  it('counts line numbers from the start of the file, not the batch', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => observation(i));
    lines[9] = '{ broken';
    const batches = await collect(chunks(lines.join('\n')), { batchSize: 4 });

    // Line 10 is in the third batch, and the warning must say 10 rather than 2.
    const reported = batches.flatMap((b) => b.meta.warnings).join();
    expect(reported).toContain('line 10');
  });

  it('throws when nothing in the entire stream decodes', async () => {
    await expect(collect(chunks('nope\nstill nope\n'))).rejects.toThrow(
      /no lines that decode to a FHIR resource/i,
    );
  });

  it('reports a trailing batch that is only skipped lines', async () => {
    const batches = await collect(chunks(`${observation(1)}\n${observation(2)}\nbroken\n`), {
      batchSize: 2,
    });

    expect(batches).toHaveLength(2);
    expect(batches[1]?.bundle.entry ?? []).toHaveLength(0);
    expect(batches[1]?.meta.warnings.join()).toContain('Skipped 1 line');
  });
});

describe('parseNdjsonStream — guards', () => {
  it('refuses a source that is not async-iterable', async () => {
    await expect(collect('a string' as unknown as NdjsonSource)).rejects.toThrow(/async iterable/i);
  });

  /*
   * Without this, a file with no newline in it accumulates in the carry buffer
   * and exhausts memory exactly the way `parse()` does — which would defeat the
   * point of the module.
   */
  it('refuses a line longer than maxLineLength instead of buffering it', async () => {
    const enormous = `{"resourceType":"Observation","note":"${'x'.repeat(5000)}"`;

    await expect(collect(chunks(enormous), { maxLineLength: 1000 })).rejects.toThrow(
      /exceeds the 1000 character limit/,
    );
  });
});

describe('parseNdjsonStream — the pipeline', () => {
  it('runs no stages when no normalizer is given', async () => {
    const stu3 = JSON.stringify({
      resourceType: 'Observation',
      id: 'o1',
      status: 'final',
      // STU3 spelling; R4 calls this `hasMember`.
      related: [{ target: { reference: 'Observation/other' } }],
    });
    const [batch] = await collect(chunks(stu3));
    const [entry] = batch?.bundle.entry ?? [];

    expect(entry?.resource).toHaveProperty('related');
  });

  it('runs the same stages parse() would, in the same order', async () => {
    const stu3 = JSON.stringify({
      resourceType: 'Observation',
      id: 'o1',
      status: 'final',
      related: [{ target: { reference: 'Observation/other' } }],
    });

    const normalizer = createDefaultNormalizer();
    const [streamed] = await collect(chunks(stu3), { normalizer });
    const inMemory = normalizer.parse(stu3);

    expect(streamed?.bundle.entry?.[0]?.resource).toEqual(inMemory.bundle.entry?.[0]?.resource);
    expect(streamed?.meta.warnings).toEqual(inMemory.meta.warnings);
  });

  it('applies a custom stage to every batch, not just the first', async () => {
    const seen: number[] = [];
    const normalizer = new Normalizer().register(fhirJsonParser).use({
      name: 'count',
      transform: (result) => {
        seen.push(result.bundle.entry?.length ?? 0);
        return result;
      },
    });

    const text = Array.from({ length: 5 }, (_, i) => observation(i)).join('\n');
    await collect(chunks(text), { batchSize: 2, normalizer });

    expect(seen).toEqual([2, 2, 1]);
  });
});

describe('parseNdjsonStream — parity with parse()', () => {
  it('produces the same resources as the in-memory adapter', async () => {
    const text = Array.from({ length: 57 }, (_, i) => observation(i)).join('\n');

    const streamed = idsOf(await collect(sliced(text, 7), { batchSize: 10 }));
    const inMemory = (createDefaultNormalizer().parse(text).bundle.entry ?? []).map(
      (entry) => (entry.resource as { id: string }).id,
    );

    expect(streamed).toEqual(inMemory);
  });
});
