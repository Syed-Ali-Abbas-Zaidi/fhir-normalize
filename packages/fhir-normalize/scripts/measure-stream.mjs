#!/usr/bin/env node
/**
 * Measures what `fhir-normalize/stream` claims: that peak memory follows the
 * batch size and not the size of the input.
 *
 * Run in a child process, always, and never inside the test runner's own heap —
 * `heapUsed` there is dominated by whatever else the runner is holding, and the
 * measurement would be noise. `performance.test.ts` spawns this; `pnpm bench`
 * runs it at the sizes the README quotes.
 *
 *   node scripts/measure-stream.mjs <megabytes> [stream|parse]
 *
 * Prints one line of JSON. Peak is sampled rather than taken at the end,
 * because the end is after the garbage collector has had its chance.
 */
import { createDefaultNormalizer } from '../dist/index.js';
import { parseNdjsonStream } from '../dist/stream.js';

const megabytes = Number(process.argv[2] ?? 5);
const mode = process.argv[3] ?? 'stream';

/** One Observation, close to what a real Bulk Data export is mostly made of. */
const LINE = `${JSON.stringify({
  resourceType: 'Observation',
  id: 'obs',
  status: 'final',
  code: { text: 'Body Weight', coding: [{ system: 'http://loinc.org', code: '29463-7' }] },
  subject: { reference: 'Patient/p1' },
  effectiveDateTime: '2026-07-20T09:30:00Z',
  valueQuantity: { value: 74.5, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
})}\n`;

const CHUNK = LINE.repeat(2000);
const chunks = Math.max(1, Math.ceil((megabytes * 1024 * 1024) / CHUNK.length));

/*
 * Both, because they answer different questions. `heapUsed` is what the ratio
 * test watches: it is the JavaScript the code is holding, and it is stable
 * enough to compare across runs. `rss` is what `top` shows and what an
 * out-of-memory killer counts, so it is the honest figure for "will this fit",
 * and it is the one the README quotes.
 */
let peak = 0;
let peakRss = 0;
const sample = () => {
  const usage = process.memoryUsage();
  peak = Math.max(peak, usage.heapUsed);
  peakRss = Math.max(peakRss, usage.rss);
};

const started = Date.now();
const ticker = setInterval(sample, 5);
let resources = 0;

try {
  if (mode === 'parse') {
    // The comparison the README draws. Above the string ceiling this is not
    // slow, it is impossible, and the error is the point.
    const whole = CHUNK.repeat(chunks);
    sample();
    resources = createDefaultNormalizer().parse(whole).bundle.entry?.length ?? 0;
  } else {
    async function* source() {
      for (let index = 0; index < chunks; index += 1) yield CHUNK;
    }

    /*
     * The same normalizer `parse()` gets, so the two modes do the same work.
     * Without it the stream runs no post-parse stages at all while `parse()`
     * runs the cross-version migration over every resource, and the comparison
     * flatters streaming by measuring less of it.
     */
    const options = { normalizer: createDefaultNormalizer() };

    for await (const { bundle } of parseNdjsonStream(source(), options)) {
      resources += bundle.entry?.length ?? 0;
      sample();
    }
  }
} finally {
  clearInterval(ticker);
  sample();
}

console.log(
  JSON.stringify({
    mode,
    megabytes,
    bytes: chunks * CHUNK.length,
    resources,
    peakBytes: peak,
    peakMb: Math.round(peak / 1024 / 1024),
    peakRssBytes: peakRss,
    peakRssMb: Math.round(peakRss / 1024 / 1024),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  }),
);
