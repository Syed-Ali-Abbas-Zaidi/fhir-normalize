import { CELL_MODE, LIST_MODE } from 'fhir-normalize/simplified';
import { describe, expect, it } from 'vitest';
import {
  FORMAT_LABEL,
  MODE_OPTIONS,
  OUTPUT_TAB,
  PARSE_MODE,
  RESULT_STATE,
  ROW_CELL_OPTIONS,
  ROW_LIST_OPTIONS,
  SAMPLES,
  TAB_OPTIONS,
} from '@/constants';
import { detectFormat, parseForDisplay, registeredFormats } from '@/utils/normalize';

/**
 * The playground demonstrates the library, so it has to keep up with it.
 *
 * Twice it did not. NDJSON shipped in 1.12.0 and the playground never offered
 * it; 2.0 moved the XML adapter out of the defaults and the playground kept
 * advertising an `xml` toggle it could no longer honour, so pasting XML
 * produced "No parser registered for fhir-xml". CI was green through both,
 * because `next build` succeeds perfectly well when a format list is merely
 * incomplete and a sample only fails once someone clicks it.
 *
 * These compare the page against the registry rather than against a hardcoded
 * list, so adding a parser to the library fails here until the page catches up.
 */

/** Parse modes are the library's format tokens, plus `auto`. */
const explicitModes: string[] = MODE_OPTIONS.map((option) => option.value).filter(
  (value) => value !== PARSE_MODE.AUTO,
);

const samples = SAMPLES.map((sample) => [sample.label, sample.payload] as const);

describe('the playground offers what the library registers', () => {
  it('has a parse mode for every registered format', () => {
    const missing = registeredFormats().filter((format) => !explicitModes.includes(format));

    expect(missing).toEqual([]);
  });

  it('offers no mode the library cannot serve', () => {
    const registered: string[] = registeredFormats();
    const orphaned = explicitModes.filter((mode) => !registered.includes(mode));

    expect(orphaned).toEqual([]);
  });

  it('has a display label for every registered format', () => {
    const unlabelled = registeredFormats().filter((format) => FORMAT_LABEL[format] === undefined);

    expect(unlabelled).toEqual([]);
  });

  it('has a tab for every output view the page declares', () => {
    const offered = TAB_OPTIONS.map((option) => option.value);

    expect(offered).toEqual(expect.arrayContaining(Object.values(OUTPUT_TAB)));
  });

  // The row controls are the same kind of surface as the parse modes: built
  // from the library's own tokens, so a mode added to `toRows` fails here
  // until the Rows tab offers it.
  it.each([
    ['lists', Object.values(LIST_MODE), ROW_LIST_OPTIONS.map((option) => option.value)],
    ['cells', Object.values(CELL_MODE), ROW_CELL_OPTIONS.map((option) => option.value)],
  ])('offers every %s mode the library defines, and no other', (_label, defined, offered) => {
    expect([...offered].sort()).toEqual([...defined].sort());
  });
});

describe('every sample actually works', () => {
  // The samples are the first thing a visitor clicks, so one that fails to
  // parse is the loudest possible bug — and the easiest for a build to miss.
  it.each(samples)('%s is detected as a format the library knows', (_label, payload) => {
    expect(detectFormat(payload)).not.toBeNull();
  });

  it.each(samples)('%s parses on auto', (_label, payload) => {
    expect(parseForDisplay(payload, PARSE_MODE.AUTO).state).toBe(RESULT_STATE.OK);
  });

  it.each(samples)('%s parses under its named format, not just auto', (_label, payload) => {
    // Naming the format skips detection and goes straight to the adapter —
    // the path the mode toggle uses, and the one that threw on XML.
    //
    // Going through MODE_OPTIONS rather than casting the detected format is
    // deliberate: `SourceFormat` includes tokens the library declares but has
    // no parser for (`hl7v2`, `ccda`, `csv`), so this also asserts the toggle
    // can actually reach whatever detection picked.
    const detected = detectFormat(payload);
    const mode = MODE_OPTIONS.find((option) => option.value === detected)?.value;
    if (mode === undefined) throw new Error(`no parse mode offers the detected "${detected}"`);

    expect(parseForDisplay(payload, mode).state).toBe(RESULT_STATE.OK);
  });

  it('covers every registered format with at least one sample', () => {
    const covered = new Set(samples.map(([, payload]) => detectFormat(payload)));
    const uncovered = registeredFormats().filter((format) => !covered.has(format));

    expect(uncovered).toEqual([]);
  });
});
