import { ParseError, SOURCE_FORMAT } from '../../core';
import { DEFAULT_DELIMITERS, HEADER_SEGMENT, HL7V2_ERROR } from './constants';
import type { Delimiters, Field, Message, Repetition, Segment } from './types';

/**
 * Segments end with a carriage return in the standard. Real messages arrive
 * with any of the three line endings, usually because something in the chain
 * opened the file in text mode, so all three are accepted.
 */
const SEGMENT_TERMINATOR = /\r\n|\r|\n/;

/** Read `MSH-1` and `MSH-2` out of the first line. */
const delimitersFrom = (header: string): Delimiters => {
  const field = header[3] ?? DEFAULT_DELIMITERS.field;
  const encoding = header.slice(4, header.indexOf(field, 4) === -1 ? 8 : header.indexOf(field, 4));

  return {
    field,
    component: encoding[0] ?? DEFAULT_DELIMITERS.component,
    repetition: encoding[1] ?? DEFAULT_DELIMITERS.repetition,
    escape: encoding[2] ?? DEFAULT_DELIMITERS.escape,
    subcomponent: encoding[3] ?? DEFAULT_DELIMITERS.subcomponent,
  };
};

/**
 * Undo the escape sequences the standard defines.
 *
 * Run **after** splitting, never before: `\S\` is how a message carries a
 * literal component separator, so decoding it first would invent a component
 * boundary out of the one thing that exists to avoid one.
 *
 * An unrecognised sequence — `\Zxx\` is reserved for local use — is left
 * exactly as it arrived. Dropping it would silently discard data whose meaning
 * is simply private to the sender.
 */
const decodeEscapes = (value: string, delimiters: Delimiters): string => {
  const marker = delimiters.escape;
  if (!value.includes(marker)) return value;

  let out = '';
  let at = 0;

  while (at < value.length) {
    const start = value.indexOf(marker, at);
    if (start === -1) {
      out += value.slice(at);
      break;
    }

    out += value.slice(at, start);
    const end = value.indexOf(marker, start + 1);
    if (end === -1) {
      // An unterminated escape is just text from here on.
      out += value.slice(start);
      break;
    }

    const code = value.slice(start + 1, end);
    out += decodeEscape(code, delimiters) ?? value.slice(start, end + 1);
    at = end + 1;
  }

  return out;
};

const decodeEscape = (code: string, delimiters: Delimiters): string | undefined => {
  switch (code) {
    case 'F':
      return delimiters.field;
    case 'S':
      return delimiters.component;
    case 'T':
      return delimiters.subcomponent;
    case 'R':
      return delimiters.repetition;
    case 'E':
      return delimiters.escape;
    case '.br':
      return '\n';
    default:
      break;
  }

  // `\Xdddd\` is hexadecimal character data, two digits per character.
  if (/^X[0-9a-fA-F]+$/.test(code) && (code.length - 1) % 2 === 0) {
    const bytes = code.slice(1).match(/../g) ?? [];
    return bytes.map((byte) => String.fromCharCode(Number.parseInt(byte, 16))).join('');
  }

  return undefined;
};

const splitField = (raw: string, delimiters: Delimiters): Field =>
  raw
    .split(delimiters.repetition)
    .map((repetition) =>
      repetition
        .split(delimiters.component)
        .map((component) =>
          component.split(delimiters.subcomponent).map((part) => decodeEscapes(part, delimiters)),
        ),
    );

/**
 * `MSH` is numbered differently from every other segment, and getting it wrong
 * shifts the whole segment by one.
 *
 * `MSH-1` *is* the field separator, so it never appears between two of them;
 * splitting `MSH|^~\&|LAB|…` yields `['MSH', '^~\&', 'LAB', …]`, where naive
 * numbering makes the encoding characters field 1 and the sending application
 * field 2. Both are one too low. The separator is inserted here so that
 * `fields[1]` through `fields[n]` mean what the specification says everywhere
 * downstream.
 */
const splitSegment = (line: string, delimiters: Delimiters): Segment => {
  const [id = '', ...rest] = line.split(delimiters.field);
  const header = id === HEADER_SEGMENT;
  const raw = header ? [delimiters.field, ...rest] : rest;

  // Index 0 holds the id, so `fields[3]` is field 3.
  const fields: Field[] = [[[[id]]], ...raw.map((value) => splitField(value, delimiters))];

  /*
   * MSH-2 is the one field that must not be split: it *is* the component,
   * repetition, escape and subcomponent characters, so splitting it on them
   * shreds it into empty pieces and the encoding characters are lost. It is
   * also not escaped, for the same reason.
   */
  if (header && rest[0] !== undefined) fields[2] = [[[rest[0]]]];

  return { id, fields };
};

/**
 * Decode a message into segments, fields, repetitions, components and
 * subcomponents.
 *
 * @throws {ParseError} The input is not a string, or does not start with MSH.
 */
export const decodeMessage = (raw: unknown): Message => {
  if (typeof raw !== 'string') {
    throw new ParseError(SOURCE_FORMAT.HL7V2, HL7V2_ERROR.NOT_A_STRING);
  }

  const lines = raw
    .split(SEGMENT_TERMINATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const [header] = lines;
  if (header === undefined || !header.startsWith(HEADER_SEGMENT)) {
    throw new ParseError(SOURCE_FORMAT.HL7V2, HL7V2_ERROR.NO_HEADER);
  }

  const delimiters = delimitersFrom(header);

  return { delimiters, segments: lines.map((line) => splitSegment(line, delimiters)) };
};

/* -------------------------------------------------------------------------- */
/* Accessors. Every index is the number the specification uses.               */
/* -------------------------------------------------------------------------- */

/**
 * Every repetition of a field. Empty when the field is absent.
 *
 * A field that is present but blank (`||`) splits into one empty repetition,
 * which is not a value: left in, it becomes an empty object downstream.
 */
export const repetitions = (segment: Segment, field: number): readonly Repetition[] =>
  (segment.fields[field] ?? []).filter((repetition) =>
    repetition.some((component) => component.some((part) => part !== '')),
  );

/**
 * One value: field, then component, then subcomponent, all 1-based.
 *
 * `undefined` rather than an empty string when there is nothing there, so a
 * caller can tell "absent" from "present and blank" without checking twice.
 */
export const value = (
  segment: Segment,
  field: number,
  component = 1,
  subcomponent = 1,
): string | undefined => {
  const [first] = segment.fields[field] ?? [];
  const text = first?.[component - 1]?.[subcomponent - 1];

  return text === undefined || text === '' ? undefined : text;
};

/** The same, for a chosen repetition. */
export const valueAt = (
  repetition: Repetition,
  component = 1,
  subcomponent = 1,
): string | undefined => {
  const text = repetition[component - 1]?.[subcomponent - 1];

  return text === undefined || text === '' ? undefined : text;
};
