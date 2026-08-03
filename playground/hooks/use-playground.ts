'use client';

import { simplifyBundle } from 'fhir-normalize';
import { useMemo, useState } from 'react';
import {
  DEFAULT_SHAPE_TYPE,
  defaultSample,
  OUTPUT_TAB,
  PARSE_MODE,
  RESULT_STATE,
  SHAPE_FORMAT,
} from '@/constants';
import type { OutputTab, ParseMode, PlaygroundState, ShapeFormat } from '@/types';
import { detectFormat, hasShape, parseForDisplay, renderShape, summarize } from '@/utils';

/**
 * Owns the page's state and nothing else — every derived value is computed
 * here from `input` and `mode`, never synced into state by an effect.
 */
export const usePlayground = (): PlaygroundState => {
  const [input, setInput] = useState<string>(defaultSample?.payload ?? '');
  const [mode, setMode] = useState<ParseMode>(PARSE_MODE.AUTO);
  const [tab, setTab] = useState<OutputTab>(OUTPUT_TAB.STANDARD);
  const [deIdentify, setDeIdentify] = useState(false);
  // `null` means "follow whatever was parsed". A concrete value means the user
  // chose a type, and their choice outlives the next parse.
  const [pickedShape, setPickedShape] = useState<string | null>(null);
  const [shapeFormat, setShapeFormat] = useState<ShapeFormat>(SHAPE_FORMAT.TREE);

  const detectedFormat = useMemo(() => detectFormat(input), [input]);
  const result = useMemo(() => parseForDisplay(input, mode, deIdentify), [input, mode, deIdentify]);

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

  const normalized = useMemo(
    () => (result.state === RESULT_STATE.OK ? simplifyBundle(result.bundle) : []),
    [result],
  );

  // Derived, not synced: following the parsed resource until the user picks a
  // type is a computation, and an effect writing state back would loop.
  const parsedType = normalized.find((resource) => hasShape(resource.resourceType))?.resourceType;
  const shapeResourceType = pickedShape ?? parsedType ?? DEFAULT_SHAPE_TYPE;

  const shapeText = useMemo(
    () => renderShape(shapeResourceType, shapeFormat),
    [shapeResourceType, shapeFormat],
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
    normalized,
    deIdentify,
    setDeIdentify,
    shapeResourceType,
    setShapeResourceType: setPickedShape,
    shapeFormat,
    setShapeFormat,
    shapeText,
    warnings,
  };
};
