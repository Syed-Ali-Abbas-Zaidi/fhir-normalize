import { createDefaultNormalizer, type SourceFormat } from 'fhir-normalize';
import { PARSE_MODE, RESULT_STATE } from '@/constants';
import type { ParseMode, PlaygroundResult } from '@/types';

/**
 * One registry for the page. This is the real published surface — parsers,
 * detection, and the R4 version stage — so the demo cannot drift from the
 * library it is demonstrating.
 */
const normalizer = createDefaultNormalizer();

/**
 * A second registry with the de-identification stage. Two instances rather
 * than one rebuilt per keystroke: a Normalizer is a registry, not state.
 */
const deIdentifying = createDefaultNormalizer({ deIdentify: true });

/** Which format the library would pick, or `null` if it cannot tell. */
export const detectFormat = (input: string): SourceFormat | null => {
  const trimmed = input.trim();
  return trimmed === '' ? null : normalizer.detectFormat(trimmed);
};

/** The library's own registered format list, for the footer. */
export const registeredFormats = (): SourceFormat[] => normalizer.formats;

export const registeredStages = (): string[] => normalizer.stages;

/**
 * Parse for display. Errors become a result state rather than an exception,
 * because a half-typed payload is the normal case while someone is editing.
 */
export const parseForDisplay = (
  input: string,
  mode: ParseMode,
  deIdentify = false,
): PlaygroundResult => {
  const trimmed = input.trim();
  if (trimmed === '') return { state: RESULT_STATE.EMPTY };

  try {
    const format = mode === PARSE_MODE.AUTO ? undefined : mode;
    const registry = deIdentify ? deIdentifying : normalizer;
    return { state: RESULT_STATE.OK, ...registry.parse(trimmed, format) };
  } catch (error) {
    return {
      state: RESULT_STATE.ERROR,
      name: error instanceof Error ? error.name : 'ParseError',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
