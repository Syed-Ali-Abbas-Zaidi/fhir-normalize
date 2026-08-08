'use client';

import { simplifyBundle } from 'fhir-normalize';
import { CELL_MODE, type CellMode, LIST_MODE, type ListMode } from 'fhir-normalize/simplified';
import { useMemo, useState } from 'react';
import {
  DEFAULT_SHAPE_TYPE,
  defaultSample,
  NO_EXPLODE,
  OUTPUT_TAB,
  PARSE_MODE,
  RESULT_STATE,
  SHAPE_FORMAT,
} from '@/constants';
import type { OutputTab, ParseMode, PlaygroundState, ShapeFormat } from '@/types';
import {
  detectFormat,
  explodableFields,
  hasShape,
  parseForDisplay,
  renderShape,
  rowOptionsFrom,
  rowTables,
  summarize,
} from '@/utils';

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
  const [rowLists, setRowLists] = useState<ListMode>(LIST_MODE.FIRST);
  const [rowCells, setRowCells] = useState<CellMode>(CELL_MODE.TEXT);
  const [pickedExplode, setPickedExplode] = useState<string>(NO_EXPLODE);

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

  const explodable = useMemo(() => explodableFields(normalized), [normalized]);

  // Derived the same way the shape picker is: a field chosen for one payload
  // must not survive into another that has no such field, or the tab would
  // silently project against a field nothing carries.
  const rowExplode = explodable.includes(pickedExplode) ? pickedExplode : NO_EXPLODE;

  const rowTablesForResult = useMemo(
    () => rowTables(normalized, rowOptionsFrom(rowLists, rowCells, rowExplode)),
    [normalized, rowLists, rowCells, rowExplode],
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
    rowTables: rowTablesForResult,
    rowLists,
    setRowLists,
    rowCells,
    setRowCells,
    rowExplode,
    setRowExplode: setPickedExplode,
    explodableFields: explodable,
    warnings,
  };
};
