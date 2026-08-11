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

/** What an async generator function actually returns, which is not a literal. */
const fromGenerator = async function* (...pieces: (string | Uint8Array)[]): NdjsonSource {
  for (const piece of pieces) yield piece;
};

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
    // Written out rather than taken from an unsplit run of the same module: a
    // parser that dropped or reordered a resource on both paths would agree
    // with itself and the test would pass.
    const expected = Array.from({ length: 12 }, (_, i) => `obs-${i}`);
    const text = Array.from({ length: 12 }, (_, i) => observation(i)).join('\n');

    expect(idsOf(await collect(chunks(text)))).toEqual(expected);

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
  it('refuses an unterminated line that grows across many chunks', async () => {
    // The accumulation case: no chunk is large, but together they never end.
    const pieces = Array.from({ length: 200 }, () => 'x'.repeat(100));

    await expect(
      collect(chunks(`{"resourceType":"Observation","note":"`, ...pieces), {
        maxLineLength: 1000,
      }),
    ).rejects.toThrow(/Line 1 exceeds the 1000 character limit/);
  });

  it('refuses a complete oversized line that arrives inside one chunk', async () => {
    /*
     * Checked only after a chunk boundary, this line is already decoded by the
     * time the limit is consulted — so the cap reads as enforced while
     * JSON.parse has taken the hit it exists to prevent.
     */
    const oversized = `${JSON.stringify({ resourceType: 'Observation', id: 'big', note: 'x'.repeat(5000) })}\n`;

    await expect(collect(chunks(oversized), { maxLineLength: 1000 })).rejects.toThrow(
      /Line 1 exceeds the 1000 character limit/,
    );
  });

  it('reports the line number of the offending line, not of the first', async () => {
    const ok = `${observation(1)}\n${observation(2)}\n`;
    const oversized = `${JSON.stringify({ resourceType: 'Observation', note: 'x'.repeat(5000) })}\n`;

    await expect(collect(chunks(ok + oversized), { maxLineLength: 1000 })).rejects.toThrow(
      /Line 3 exceeds/,
    );
  });
});

describe('parseNdjsonStream — the sources it documents', () => {
  it('accepts an async generator object', async () => {
    const batches = await collect(fromGenerator(`${observation(1)}\n${observation(2)}\n`));

    expect(idsOf(batches)).toEqual(['obs-1', 'obs-2']);
  });

  it('accepts a Node Readable, which is a class instance rather than a literal', async () => {
    const { Readable } = await import('node:stream');
    const source = Readable.from([`${observation(1)}\n`, `${observation(2)}\n`]);

    expect(idsOf(await collect(source))).toEqual(['obs-1', 'obs-2']);
  });

  it('accepts a Node Readable in binary mode, which yields Buffers', async () => {
    const { Readable } = await import('node:stream');
    const bytes = new TextEncoder().encode(`${observation(1)}\n${observation(2)}\n`);
    const source = Readable.from([Buffer.from(bytes.slice(0, 30)), Buffer.from(bytes.slice(30))]);

    expect(idsOf(await collect(source))).toEqual(['obs-1', 'obs-2']);
  });

  it('accepts a web ReadableStream', async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(`${observation(1)}\n`);
        controller.enqueue(`${observation(2)}\n`);
        controller.close();
      },
    }) as unknown as NdjsonSource;

    expect(idsOf(await collect(source))).toEqual(['obs-1', 'obs-2']);
  });

  it('rejects an async generator function that was never called', async () => {
    // A plausible mistake, and the one case worth failing loudly: the function
    // is not iterable, only what it returns is.
    await expect(collect(fromGenerator as unknown as NdjsonSource)).rejects.toThrow(
      /async iterable/i,
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
