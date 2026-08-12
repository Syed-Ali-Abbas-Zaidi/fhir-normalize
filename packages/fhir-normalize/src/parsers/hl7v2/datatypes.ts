import type { WarningLog } from '../../core';
import { HL7V2_WARNING } from './constants';
import { valueAt } from './lexer';
import type { Repetition } from './types';

/** `YYYY[MM[DD[HH[MM[SS[.S+]]]]]][+/-ZZZZ]`, the one timestamp v2 uses. */
const TIMESTAMP = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\.\d{1,4})?([+-]\d{4})?$/;

/**
 * An HL7 timestamp as an R4 `dateTime`.
 *
 * The awkward case is a time with no offset. R4's `dateTime` regex **requires**
 * a timezone once hours are present, so `20260812120000` cannot be written as
 * `2026-08-12T12:00:00` — that is not a `dateTime`, and a Bundle carrying it is
 * not R4. Rather than invent an offset the message did not state, the time is
 * dropped and the date kept, and the loss is reported. Inventing UTC would be a
 * twelve-hour error on the other side of the world.
 */
export const toDateTime = (
  raw: string | undefined,
  at: string,
  warnings: WarningLog,
): string | undefined => {
  if (raw === undefined) return undefined;

  const match = TIMESTAMP.exec(raw.trim());
  if (match === null) {
    warnings.add(HL7V2_WARNING.UNPARSEABLE_DATE(at, raw));
    return undefined;
  }

  const [, year, month, day, hour, minute, second, fraction, offset] = match;

  if (month === undefined) return year;
  if (day === undefined) return `${year}-${month}`;

  const date = `${year}-${month}-${day}`;
  if (hour === undefined) return date;

  if (offset === undefined) {
    warnings.add(HL7V2_WARNING.TIME_DROPPED(at, raw));
    return date;
  }

  const time = `${hour}:${minute ?? '00'}:${second ?? '00'}${fraction ?? ''}`;

  return `${date}T${time}${offset.slice(0, 3)}:${offset.slice(3)}`;
};

/** The date part only, for elements R4 types as `date`. */
export const toDate = (
  raw: string | undefined,
  at: string,
  warnings: WarningLog,
): string | undefined => toDateTime(raw, at, warnings)?.slice(0, 10);

/**
 * A coded element (`CE`/`CWE`) as a `CodeableConcept`.
 *
 * `code^text^system`, with an alternate triplet in components 4 to 6. A
 * concept with neither a coding nor text is nothing at all, so it yields
 * `undefined` rather than an empty object — R4 has no use for `{}` and
 * validation would report the empty element.
 */
export const toCodeableConcept = (
  repetition: Repetition | undefined,
): Record<string, unknown> | undefined => {
  if (repetition === undefined) return undefined;

  const coding: Record<string, unknown>[] = [];

  for (const [code, display, system] of [
    [valueAt(repetition, 1), valueAt(repetition, 2), valueAt(repetition, 3)],
    [valueAt(repetition, 4), valueAt(repetition, 5), valueAt(repetition, 6)],
  ]) {
    if (code === undefined) continue;

    const entry: Record<string, unknown> = { code };
    if (system !== undefined) entry.system = system;
    if (display !== undefined) entry.display = display;
    coding.push(entry);
  }

  // Component 2 is the code's own text, and doubles as the concept text when
  // there is no code at all — a CWE carrying only `^penicillin` is common.
  const text = valueAt(repetition, 2) ?? valueAt(repetition, 9);

  if (coding.length === 0 && text === undefined) return undefined;

  const concept: Record<string, unknown> = {};
  if (coding.length > 0) concept.coding = coding;
  if (text !== undefined) concept.text = text;

  return concept;
};

/** `XPN`: `family^given^middleOrInitial^suffix^prefix`. */
export const toHumanName = (repetition: Repetition): Record<string, unknown> | undefined => {
  const family = valueAt(repetition, 1);
  const given = [valueAt(repetition, 2), valueAt(repetition, 3)].filter(
    (part): part is string => part !== undefined,
  );
  const prefix = valueAt(repetition, 5);
  const suffix = valueAt(repetition, 4);

  if (family === undefined && given.length === 0) return undefined;

  const name: Record<string, unknown> = {};
  if (family !== undefined) name.family = family;
  if (given.length > 0) name.given = given;
  if (prefix !== undefined) name.prefix = [prefix];
  if (suffix !== undefined) name.suffix = [suffix];

  return name;
};

/** `XAD`: `street^otherDesignation^city^state^postalCode^country`. */
export const toAddress = (repetition: Repetition): Record<string, unknown> | undefined => {
  const line = [valueAt(repetition, 1), valueAt(repetition, 2)].filter(
    (part): part is string => part !== undefined,
  );
  const city = valueAt(repetition, 3);
  const state = valueAt(repetition, 4);
  const postalCode = valueAt(repetition, 5);
  const country = valueAt(repetition, 6);

  if (line.length === 0 && city === undefined && postalCode === undefined) return undefined;

  const address: Record<string, unknown> = {};
  if (line.length > 0) address.line = line;
  if (city !== undefined) address.city = city;
  if (state !== undefined) address.state = state;
  if (postalCode !== undefined) address.postalCode = postalCode;
  if (country !== undefined) address.country = country;

  return address;
};

/**
 * `XTN` as a `ContactPoint`.
 *
 * Component 1 is the legacy formatted number and component 12 the unformatted
 * one; either will do, and one of them is usually empty. An email address
 * arrives in component 4 with `NET` in component 3.
 */
export const toContactPoint = (
  repetition: Repetition,
  use: string,
): Record<string, unknown> | undefined => {
  const email = valueAt(repetition, 4);
  if (valueAt(repetition, 3) === 'NET' && email !== undefined) {
    return { system: 'email', value: email, use: 'home' };
  }

  const number = valueAt(repetition, 1) ?? valueAt(repetition, 12);
  if (number === undefined) return undefined;

  return { system: 'phone', value: number, use };
};

/** `CX`: `id^checkDigit^checkDigitScheme^assigningAuthority^identifierTypeCode`. */
export const toIdentifier = (repetition: Repetition): Record<string, unknown> | undefined => {
  const id = valueAt(repetition, 1);
  if (id === undefined) return undefined;

  const identifier: Record<string, unknown> = { value: id };

  const authority = valueAt(repetition, 4);
  if (authority !== undefined) identifier.system = `urn:hl7v2:${authority}`;

  const typeCode = valueAt(repetition, 5);
  if (typeCode !== undefined) {
    identifier.type = {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: typeCode }],
    };
  }

  return identifier;
};

/** Drops the entries a converter refused, and the field entirely if none survive. */
export const listOrNothing = <T>(items: readonly (T | undefined)[]): T[] | undefined => {
  const kept = items.filter((item): item is T => item !== undefined);

  return kept.length > 0 ? kept : undefined;
};
