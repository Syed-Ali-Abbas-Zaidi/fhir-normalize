'use client';

import { useMemo, useState } from 'react';
import { defaultSample, OUTPUT_TAB, PARSE_MODE, RESULT_STATE } from '@/constants';
import type { OutputTab, ParseMode, PlaygroundState } from '@/types';
import { detectFormat, parseForDisplay, summarize } from '@/utils';

/**
 * Owns the page's state and nothing else — every derived value is computed
 * here from `input` and `mode`, never synced into state by an effect.
 */
export const usePlayground = (): PlaygroundState => {
  const [input, setInput] = useState<string>(defaultSample?.payload ?? '');
  const [mode, setMode] = useState<ParseMode>(PARSE_MODE.AUTO);
  const [tab, setTab] = useState<OutputTab>(OUTPUT_TAB.STANDARD);

  const detectedFormat = useMemo(() => detectFormat(input), [input]);
  const result = useMemo(() => parseForDisplay(input, mode), [input, mode]);

  const resources = useMemo(
    () =>
      result.state === RESULT_STATE.OK
        ? (result.bundle.entry ?? []).map((entry) => entry.resource).filter(Boolean)
        : [],
    [result],
  );

  const summaries = useMemo(
    () => resources.map((resource, index) => summarize(resource, index)),
    [resources],
  );

  const warnings = result.state === RESULT_STATE.OK ? result.meta.warnings : [];

  return {
    input,
    setInput,
    mode,
    setMode,
    tab,
    setTab,
    detectedFormat,
    result,
    summaries,
    warnings,
  };
};
