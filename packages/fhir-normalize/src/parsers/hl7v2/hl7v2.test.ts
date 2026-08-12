import { describe, expect, it } from 'vitest';
import { ParseError } from '../../core';
import { validateBundle } from '../../validate';
import { hl7v2Parser } from './index';
import { decodeMessage, repetitions, value } from './lexer';

/** Segments joined with the carriage return the standard actually specifies. */
const message = (...segments: string[]) => segments.join('\r');

const HEADER = 'MSH|^~\\&|LAB|MAIN|EHR|MAIN|20260812093000-0400||ADT^A01|MSG1|P|2.5';

/**
 * A segment built from `{ fieldNumber: value }`, so a test says which field it
 * means instead of counting pipes. Five of the fixtures here were wrong the
 * first time for exactly that reason.
 */
const segment = (id: string, fields: Record<number, string>): string => {
  const highest = Math.max(...Object.keys(fields).map(Number));
  const parts = Array.from({ length: highest }, (_, index) => fields[index + 1] ?? '');

  return [id, ...parts].join('|');
};

const parse = (...segments: string[]) => {
  const result = hl7v2Parser.parse(message(HEADER, ...segments));
  const resources = (result.bundle.entry ?? []).map(
    (entry) => entry.resource as unknown as Record<string, unknown>,
  );

  return {
    resources,
    of: (resourceType: string) => resources.filter((r) => r.resourceType === resourceType),
    first: (resourceType: string) =>
      (resources.find((r) => r.resourceType === resourceType) ?? {}) as Record<string, unknown>,
    warnings: result.meta.warnings,
    bundle: result.bundle,
  };
};

describe('detection', () => {
  it('accepts a message and rejects everything else', () => {
    expect(hl7v2Parser.canParse(HEADER)).toBe(true);
    expect(hl7v2Parser.canParse(`  \n${HEADER}`)).toBe(true);

    // A delimiter has to follow, so prose beginning with the letters does not
    // get taken for a message.
    expect(hl7v2Parser.canParse('MSHA is a standard')).toBe(false);
    expect(hl7v2Parser.canParse('MSH is the header segment')).toBe(false);
    expect(hl7v2Parser.canParse('<Patient/>')).toBe(false);
    expect(hl7v2Parser.canParse('{"resourceType":"Patient"}')).toBe(false);
    expect(hl7v2Parser.canParse(42)).toBe(false);
  });
});

describe('the lexer', () => {
  it('reads the delimiters the message declares, not the usual ones', () => {
    // A sender is entitled to choose others; hardcoding `|^~\&` mis-splits this.
    const odd = 'MSH#@$\\%#LAB#MAIN#EHR#MAIN#20260812093000-0400##ADT@A01#MSG1#P#2.5';
    const { delimiters, segments } = decodeMessage(odd);

    expect(delimiters).toEqual({
      field: '#',
      component: '@',
      repetition: '$',
      escape: '\\',
      subcomponent: '%',
    });
    expect(value(segments[0] as never, 9, 1)).toBe('ADT');
    expect(value(segments[0] as never, 9, 2)).toBe('A01');
  });

  it('numbers MSH the way the standard does, not the way splitting suggests', () => {
    /*
     * MSH-1 *is* the field separator, so it never appears between two of them.
     * Naive splitting makes the encoding characters field 1 and the sending
     * application field 2 — both one too low, which shifts the whole segment.
     */
    const [header] = decodeMessage(HEADER).segments;

    expect(value(header as never, 1)).toBe('|');
    expect(value(header as never, 2)).toBe('^~\\&');
    expect(value(header as never, 3)).toBe('LAB');
    expect(value(header as never, 12)).toBe('2.5');
  });

  it('numbers other segments from one, with no offset to remember', () => {
    const [, pid] = decodeMessage(message(HEADER, 'PID|1||12345||DOE^JOHN')).segments;

    expect(value(pid as never, 1)).toBe('1');
    expect(value(pid as never, 3)).toBe('12345');
    expect(value(pid as never, 5, 2)).toBe('JOHN');
  });

  it('splits repetitions, components and subcomponents', () => {
    const [, pid] = decodeMessage(message(HEADER, 'PID|||a^b&c~d^e')).segments;
    const reps = repetitions(pid as never, 3);

    expect(reps).toHaveLength(2);
    expect(reps[0]).toEqual([['a'], ['b', 'c']]);
    expect(reps[1]).toEqual([['d'], ['e']]);
  });

  it('treats a present but blank field as absent', () => {
    const [, pid] = decodeMessage(message(HEADER, 'PID|1||||')).segments;

    expect(repetitions(pid as never, 3)).toEqual([]);
    expect(value(pid as never, 3)).toBeUndefined();
  });

  it('accepts all three line endings, because all three arrive', () => {
    for (const terminator of ['\r', '\n', '\r\n']) {
      const raw = [HEADER, 'PID|1||12345'].join(terminator);

      expect(decodeMessage(raw).segments).toHaveLength(2);
    }
  });

  it('decodes escape sequences after splitting, never before', () => {
    /*
     * `\S\` is how a message carries a literal component separator. Decoded
     * before the split it would invent the very boundary it exists to avoid,
     * so this must be one component containing a caret.
     */
    const [, pid] = decodeMessage(
      message(HEADER, 'PID|||||a\\S\\b^second\\F\\field\\T\\sub\\R\\rep\\E\\esc\\.br\\line'),
    ).segments;
    const [first] = repetitions(pid as never, 5);

    expect(first?.[0]).toEqual(['a^b']);
    expect(first?.[1]).toEqual(['second|field&sub~rep\\esc\nline']);
  });

  it('decodes hexadecimal escapes', () => {
    const [, pid] = decodeMessage(message(HEADER, 'PID|||\\X48454C4C4F\\')).segments;

    expect(value(pid as never, 3)).toBe('HELLO');
  });

  it('leaves an unknown or unterminated escape exactly as it arrived', () => {
    // `\Z..\` is reserved for local use; dropping it would discard data whose
    // meaning is merely private to the sender.
    const [, pid] = decodeMessage(message(HEADER, 'PID|||\\Zlocal\\|\\unterminated')).segments;

    expect(value(pid as never, 3)).toBe('\\Zlocal\\');
    expect(value(pid as never, 4)).toBe('\\unterminated');
  });
});

describe('errors', () => {
  it('refuses input that is not a string', () => {
    expect(() => hl7v2Parser.parse(42)).toThrow(ParseError);
  });

  it('refuses a message that does not start with MSH', () => {
    expect(() => hl7v2Parser.parse('PID|1||12345')).toThrow(/must begin with an MSH/);
  });

  it('refuses a message where nothing maps to a resource', () => {
    expect(() => hl7v2Parser.parse(message(HEADER, 'ZZZ|1|nothing'))).toThrow(
      /No segment in the message maps/,
    );
  });
});

describe('PID -> Patient', () => {
  it('maps the fields an ADT actually carries', () => {
    const { first } = parse(
      'PID|1||12345^^^MRN^MR~99887^^^SSN^SS||DOE^JOHN^A^JR^MR||19800115|M|||123 MAIN ST^APT 4^ANYTOWN^CA^90210^USA||555-1234|555-9999||S',
    );
    const patient = first('Patient');

    expect(patient.id).toBe('patient-12345');
    expect(patient.identifier).toHaveLength(2);
    expect(patient.name).toEqual([
      { family: 'DOE', given: ['JOHN', 'A'], prefix: ['MR'], suffix: ['JR'] },
    ]);
    expect(patient.birthDate).toBe('1980-01-15');
    expect(patient.gender).toBe('male');
    expect(patient.address).toEqual([
      {
        line: ['123 MAIN ST', 'APT 4'],
        city: 'ANYTOWN',
        state: 'CA',
        postalCode: '90210',
        country: 'USA',
      },
    ]);
    expect(patient.telecom).toEqual([
      { system: 'phone', value: '555-1234', use: 'home' },
      { system: 'phone', value: '555-9999', use: 'work' },
    ]);
  });

  it('reports a sex code R4 has no gender for', () => {
    const { first, warnings } = parse('PID|1||1||X^Y||19800115|Q');

    expect(first('Patient').gender).toBeUndefined();
    expect(warnings.join()).toContain('PID-8');
  });

  it('prefers the deceased date over the flag, and falls back to it', () => {
    const both = segment('PID', { 1: '1', 3: '1', 5: 'A^B', 29: '20260101', 30: 'Y' });
    const flagOnly = segment('PID', { 1: '1', 3: '1', 5: 'A^B', 30: 'Y' });

    expect(parse(both).first('Patient')).toHaveProperty('deceasedDateTime', '2026-01-01');
    expect(parse(flagOnly).first('Patient')).toHaveProperty('deceasedBoolean', true);
  });

  it('recognises an email in an XTN', () => {
    const { first } = parse(segment('PID', { 1: '1', 3: '1', 5: 'A^B', 13: '^^NET^a@b.example' }));

    expect(first('Patient').telecom).toEqual([
      { system: 'email', value: 'a@b.example', use: 'home' },
    ]);
  });
});

describe('timestamps', () => {
  const birthDateOf = (raw: string) =>
    parse(`PID|1||1||A^B||${raw}`).first('Patient').birthDate as string | undefined;

  it('handles every precision the format allows', () => {
    expect(birthDateOf('1980')).toBe('1980');
    expect(birthDateOf('198001')).toBe('1980-01');
    expect(birthDateOf('19800115')).toBe('1980-01-15');
  });

  it('keeps a time only when the message stated an offset', () => {
    const { first } = parse(
      segment('PID', { 1: '1', 3: '1', 5: 'A^B', 29: '20260812093000-0400' }),
    );

    expect(first('Patient').deceasedDateTime).toBe('2026-08-12T09:30:00-04:00');
  });

  it('drops a time with no offset rather than inventing UTC', () => {
    /*
     * R4's dateTime requires a timezone once hours are present, so
     * `2026-08-12T09:30:00` is not a dateTime and a Bundle carrying it is not
     * R4. Assuming UTC would be a twelve-hour error on the other side of the
     * world, so the date is kept and the loss reported.
     */
    const { first, warnings } = parse(
      segment('PID', { 1: '1', 3: '1', 5: 'A^B', 29: '20260812093000' }),
    );

    expect(first('Patient').deceasedDateTime).toBe('2026-08-12');
    expect(warnings.join()).toContain('no UTC offset');
  });

  it('reports a timestamp it cannot read', () => {
    const { first, warnings } = parse('PID|1||1||A^B||not-a-date');

    expect(first('Patient').birthDate).toBeUndefined();
    expect(warnings.join()).toContain('is not an HL7 timestamp');
  });
});

describe('the other segments', () => {
  it('maps PV1 to an Encounter with a status R4 requires', () => {
    const { first } = parse(
      'PID|1||1||A^B',
      'PV1|1|I|ICU^101||||||||||||||||VISIT99|||||||||||||||||||||||||20260812080000-0400',
    );
    const encounter = first('Encounter');

    expect(encounter.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'IMP',
      display: 'inpatient encounter',
    });
    // PV1 has no field that means a status, and R4 requires one. `unknown` is
    // the honest answer; `finished` would assert what the message never said.
    expect(encounter.status).toBe('unknown');
    expect(encounter.subject).toEqual({ reference: 'Patient/patient-1' });
  });

  it('writes the value[x] that OBX-2 asks for', () => {
    const { of } = parse(
      'PID|1||1||A^B',
      'OBX|1|NM|8867-4^Heart rate^LN||72|/min^per minute^UCUM|||||F',
      'OBX|2|ST|NOTE^Comment^L||free text||||||F',
      'OBX|3|CE|C^Coded^L||X^Positive^L||||||F',
      'OBX|4|DTM|W^When^L||20260812093000-0400||||||F',
    );
    const [numeric, text, coded, when] = of('Observation');

    expect(numeric?.valueQuantity).toEqual({
      value: 72,
      unit: 'per minute',
      code: '/min',
      system: 'UCUM',
    });
    expect(text?.valueString).toBe('free text');
    expect(coded?.valueCodeableConcept).toEqual({
      coding: [{ code: 'X', display: 'Positive', system: 'L' }],
      text: 'Positive',
    });
    expect(when?.valueDateTime).toBe('2026-08-12T09:30:00-04:00');
  });

  it('keeps a numeric value that is not a number as a string, and says so', () => {
    const { first, warnings } = parse('PID|1||1||A^B', 'OBX|1|NM|X^Y^L||>100||||||F');

    expect(first('Observation').valueString).toBe('>100');
    expect(first('Observation').valueQuantity).toBeUndefined();
    expect(warnings.join()).toContain('not a number');
  });

  it('maps AL1 and DG1', () => {
    const { first } = parse(
      'PID|1||1||A^B',
      segment('AL1', { 1: '1', 2: 'DA', 3: '^PENICILLIN', 4: 'SV', 5: 'HIVES', 6: '20200101' }),
      segment('DG1', { 1: '1', 3: 'J18.9^Pneumonia^I10', 5: '20260812' }),
    );

    expect(first('AllergyIntolerance')).toMatchObject({
      criticality: 'high',
      patient: { reference: 'Patient/patient-1' },
      reaction: [{ manifestation: [{ text: 'HIVES' }] }],
    });
    expect(first('Condition')).toMatchObject({
      code: { coding: [{ code: 'J18.9', display: 'Pneumonia', system: 'I10' }] },
      recordedDate: '2026-08-12',
    });
  });
});

describe('the message as a whole', () => {
  it('names the segments it skipped rather than dropping them silently', () => {
    const { warnings } = parse('PID|1||1||A^B', 'NK1|1|DOE^JANE', 'NK1|2|DOE^JIM', 'IN1|1|PLAN');

    expect(warnings.join()).toContain('2 NK1 segments skipped');
    expect(warnings.join()).toContain('1 IN1 segment skipped');
  });

  it('says so when there is no PID for the rest to hang off', () => {
    const { first, warnings } = parse('OBX|1|ST|A^B^L||text||||||F');

    expect(first('Observation').subject).toBeUndefined();
    expect(warnings.join()).toContain('no PID to attach to');
  });

  it('produces the same bundle twice, with ids derived rather than generated', () => {
    const segments = ['PID|1||12345||A^B', 'OBX|1|ST|A^B^L||x||||||F'] as const;

    expect(parse(...segments).bundle).toEqual(parse(...segments).bundle);
  });

  /*
   * The strongest check available, and the one that caught the XML bugs in
   * 2.3.1: the library's own validator reading what its own parser produced.
   * A mapping that invents an element, gets a cardinality wrong or writes a
   * choice type R4 forbids is reported here rather than shipped.
   */
  it('emits R4 that this library itself considers conformant', () => {
    const { bundle } = parse(
      'PID|1||12345^^^MRN^MR~99887^^^SSN^SS||DOE^JOHN^A^JR^MR||19800115|M|||123 MAIN ST^APT 4^ANYTOWN^CA^90210^USA||555-1234|555-9999||S',
      'PV1|1|I|ICU^101||||||||||||||||VISIT99|||||||||||||||||||||||||20260812080000-0400',
      segment('AL1', { 1: '1', 2: 'DA', 3: '^PENICILLIN', 4: 'SV', 5: 'HIVES', 6: '20200101' }),
      segment('DG1', { 1: '1', 3: 'J18.9^Pneumonia^I10', 5: '20260812' }),
      'OBX|1|NM|8867-4^Heart rate^LN||72|/min^per minute^UCUM|60-100|N|||F|||20260812093000-0400',
      'OBX|2|CE|C^Coded^L||X^Positive^L||||||F',
    );

    expect(validateBundle(bundle)).toEqual([]);
  });
});
