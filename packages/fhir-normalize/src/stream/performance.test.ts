import { constants } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The one claim in this repository that had no test behind it.
 *
 * `fhir-normalize/stream` exists because peak memory should follow the batch
 * size and not the size of the input, and the README prints figures saying so.
 * Nothing checked them, so a change that quietly accumulated — collecting
 * batches, or letting the carry buffer grow — would have kept every other test
 * green while undoing the entire point of the module.
 *
 * What is asserted here is the **ratio**, never the megabytes. Absolute figures
 * belong to the machine that produced them and would make this flaky on a CI
 * runner; how peak memory responds to a tenfold increase in input is a property
 * of the code. Measured on this machine, over repeated runs, with both modes
 * doing the same work:
 *
 *   streaming                   2.12x   (varies by 0.01)
 *   streaming, accumulating     6.29x
 *   parse()                     7.78x   (varies by 0.02)
 *
 * Two assertions, because a fixed threshold and a relative one fail in
 * different ways. The ceiling catches a regression on a machine where
 * everything is slower; comparing against `parse()` calibrates to whatever
 * machine is running, so a runner with different collector behaviour moves both
 * numbers together and the comparison still holds.
 *
 * `parse()` is measured anyway and asserted to *exceed* the ceiling: if the
 * harness ever stopped measuring anything real, that assertion is what notices.
 */

const SMALL_MB = 5;
const LARGE_MB = 50;

/**
 * Ten times the input must not cost anything like ten times the memory.
 *
 * Sits between streaming at 2.1x and an accumulating regression at 6.3x, near
 * enough the middle that neither a slow runner nor a lenient one moves the
 * verdict.
 */
const GROWTH_LIMIT = 4;

const SCRIPT = new URL('../../scripts/measure-stream.mjs', import.meta.url).pathname;
const DIST = new URL('../../dist/stream.js', import.meta.url).pathname;

interface Measurement {
  bytes: number;
  resources: number;
  peakBytes: number;
}

/**
 * Always a child process. Measuring `heapUsed` inside the test runner would
 * report whatever else the runner is holding, which is most of it.
 */
const cache = new Map<string, Measurement>();

const measure = (megabytes: number, mode: 'stream' | 'parse'): Measurement => {
  // Four distinct measurements serve all four tests; each costs a process.
  const cached = cache.get(`${mode}:${megabytes}`);
  if (cached !== undefined) return cached;

  if (!existsSync(DIST)) {
    throw new Error(
      'This test measures the built module. Run `pnpm --filter fhir-normalize build` first — ' +
        '`pnpm verify` and CI both do.',
    );
  }

  const output = execFileSync(
    process.execPath,
    ['--max-old-space-size=2048', SCRIPT, String(megabytes), mode],
    // `execFileSync` blocks this worker, so vitest's own timeout cannot
    // interrupt it. This one can, and sits below the test's.
    { encoding: 'utf8', timeout: 45_000 },
  );

  const measurement = JSON.parse(output) as Measurement;
  cache.set(`${mode}:${megabytes}`, measurement);

  return measurement;
};

const growth = (mode: 'stream' | 'parse'): number =>
  measure(LARGE_MB, mode).peakBytes / measure(SMALL_MB, mode).peakBytes;

describe('streaming holds the batch, not the file', () => {
  it('costs barely more memory for ten times the input', { timeout: 60_000 }, () => {
    expect(growth('stream')).toBeLessThan(GROWTH_LIMIT);
  });

  it('grows far more slowly than reading the whole thing at once', { timeout: 60_000 }, () => {
    // Calibrated against the same machine rather than a constant, so a runner
    // whose collector behaves differently moves both sides together.
    expect(growth('stream')).toBeLessThan(growth('parse') / 2);
  });

  it('holds a fraction of the input at its peak', { timeout: 60_000 }, () => {
    const large = measure(LARGE_MB, 'stream');

    expect(large.resources).toBeGreaterThan(100_000);
    // Nothing but the current batch is retained, so the whole file is never
    // resident. Generous, because the floor is Node's own baseline heap.
    expect(large.peakBytes).toBeLessThan(large.bytes / 2);
  });

  /*
   * The control. Without it a harness that returned a constant would pass
   * everything above, and this test would protect nothing.
   */
  it('measures something real, because parse() fails the same check', { timeout: 60_000 }, () => {
    expect(growth('parse')).toBeGreaterThan(GROWTH_LIMIT);
  });
});

describe('the ceiling the streaming entry point exists for', () => {
  it('is the string limit the README quotes', () => {
    // `parse()` takes the whole input as one string, so this is the hard limit
    // on it — not a slow path above the line, an impossible one.
    expect(Math.round(constants.MAX_STRING_LENGTH / 1024 / 1024)).toBe(512);
  });
});
