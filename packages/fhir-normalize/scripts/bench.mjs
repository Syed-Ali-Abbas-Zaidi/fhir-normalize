#!/usr/bin/env node
/**
 * Produces the streaming figures the README quotes, in the shape the README
 * wants them, so updating the table is copying rather than typing.
 *
 *   pnpm --filter fhir-normalize bench
 *
 * Not run in CI. The absolute numbers belong to the machine that produced them
 * and would be flaky anywhere else — what CI checks is the *ratio*, in
 * `src/stream/performance.test.ts`, which is a property of the code rather than
 * of the hardware. This exists so the published figures stay honest, and so
 * nobody has to invent one.
 */
import { execFileSync } from 'node:child_process';

const SIZES = [250, 700];
const SCRIPT = new URL('./measure-stream.mjs', import.meta.url).pathname;

const run = (megabytes, mode) => {
  try {
    const output = execFileSync(
      process.execPath,
      ['--max-old-space-size=8192', SCRIPT, String(megabytes), mode],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    return JSON.parse(output);
  } catch (error) {
    // Above the string ceiling `parse()` cannot run at all, which is the row
    // the table exists to show.
    const detail = `${error.stderr ?? ''}`;
    if (detail.includes('ERR_STRING_TOO_LONG') || detail.includes('Invalid string length')) {
      return { failed: 'ERR_STRING_TOO_LONG' };
    }

    throw error;
  }
};

const cell = (result) =>
  result.failed ? `\`${result.failed}\`` : `${result.seconds} s, **${result.peakRssMb} MB**`;

console.log('| Export | `parse()` | `parseNdjsonStream()` |');
console.log('| --- | --- | --- |');

for (const megabytes of SIZES) {
  const streamed = run(megabytes, 'stream');
  const parsed = run(megabytes, 'parse');

  console.log(
    `| ${megabytes} MB, ${streamed.resources.toLocaleString('en-US')} resources | ` +
      `${cell(parsed)} | ${cell(streamed)} |`,
  );
}

console.log();
console.log('Peak is sampled resident set size, not the figure after collection.');
