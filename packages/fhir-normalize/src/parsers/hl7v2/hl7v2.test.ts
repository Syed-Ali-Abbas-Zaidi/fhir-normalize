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

  it('decodes hexadecimal escapes as UTF-8, not one character per byte', () => {
    const [, pid] = decodeMessage(
      // 'HELLO', then C3A9 — the two UTF-8 bytes of 'é'. Read individually
      // those are 'Ã©', which is what a name outside ASCII turns into.
      message(HEADER, 'PID|||\\X48454C4C4F\\|\\XC3A9\\'),
    ).segments;

    expect(value(pid as never, 3)).toBe('HELLO');
    expect(value(pid as never, 4)).toBe('é');
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

describe('what R4 refuses to accept', () => {
  /*
   * Every case here produced a Bundle that this library's own validator called
   * invalid. The assertion is that validator, not a hand-written expectation:
   * a mapping that drops a required element is caught by the thing that knows
   * which elements are required.
   */
  const errorsIn = (...segments: string[]) =>
    validateBundle(parse(...segments).bundle).filter((issue) => issue.severity === 'error');

  it('gives an Observation a status even when OBX-11 does not', () => {
    expect(errorsIn('PID|1||1||A^B', 'OBX|1|ST|C^D^L||text')).toEqual([]);
    expect(parse('PID|1||1||A^B', 'OBX|1|ST|C^D^L||text').first('Observation').status).toBe(
      'unknown',
    );
  });

  it('gives an Observation a status even when OBX-11 is a code R4 has none for', () => {
    const { first, warnings } = parse('PID|1||1||A^B', 'OBX|1|ST|C^D^L||text||||||Z');

    expect(first('Observation').status).toBe('unknown');
    expect(warnings.join()).toContain('OBX-11');
  });

  it('gives an Encounter a class when PV1-2 is absent or unrecognised', () => {
    expect(errorsIn('PID|1||1||A^B', 'PV1|1')).toEqual([]);
    expect(parse('PID|1||1||A^B', 'PV1|1').first('Encounter').class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
      code: 'UNK',
      display: 'unknown',
    });
  });

  it('skips AL1 and DG1 when there is no PID, because R4 makes the patient required', () => {
    const { of, warnings } = parse(
      'AL1|1|DA|^PENICILLIN',
      segment('DG1', { 1: '1', 3: 'J18.9^Pneumonia^I10' }),
      'OBX|1|ST|C^D^L||text',
    );

    expect(of('AllergyIntolerance')).toEqual([]);
    expect(of('Condition')).toEqual([]);
    // Observation.subject is optional, so that one still comes through.
    expect(of('Observation')).toHaveLength(1);
    expect(warnings.join()).toContain('R4 requires a patient on AllergyIntolerance');
    expect(warnings.join()).toContain('R4 requires a patient on Condition');

    expect(
      errorsIn(
        'AL1|1|DA|^PENICILLIN',
        segment('DG1', { 1: '1', 3: 'J^P^I10' }),
        'OBX|1|ST|C^D^L||t',
      ),
    ).toEqual([]);
  });

  it('gives two results of the same test two ids', () => {
    // OBX-3 is the code and repeats; OBX-1 is the set id and does not.
    const { of } = parse(
      'PID|1||1||A^B',
      'OBX|1|NM|8867-4^HR^LN||72||||||F',
      'OBX|2|NM|8867-4^HR^LN||80||||||F',
    );

    expect(of('Observation').map((o) => o.id)).toEqual(['observation-1', 'observation-2']);
  });

  it('refuses a timestamp whose numbers are not a real moment', () => {
    for (const raw of ['20261340', '20260229', '202608122560+0000', '20260812120000+9999']) {
      const { first, warnings } = parse(segment('PID', { 1: '1', 3: '1', 5: 'A^B', 7: raw }));

      expect(first('Patient').birthDate).toBeUndefined();
      expect(warnings.join()).toContain('is not an HL7 timestamp');
    }
  });

  it('still accepts the edges that are real', () => {
    const dateOf = (raw: string) =>
      parse(segment('PID', { 1: '1', 3: '1', 5: 'A^B', 7: raw })).first('Patient').birthDate;

    expect(dateOf('20240229')).toBe('2024-02-29');
    expect(dateOf('20261231')).toBe('2026-12-31');
    // A leap second, which R4 permits, and the largest offset it allows.
    expect(
      parse(segment('PID', { 1: '1', 3: '1', 5: 'A^B', 29: '20261231235960+1400' })).first(
        'Patient',
      ).deceasedDateTime,
    ).toBe('2026-12-31T23:59:60+14:00');
  });
});

describe('whitespace inside a segment is data', () => {
  it('keeps a value that begins or ends with a space', () => {
    // Trimming the line would silently edit the comment.
    const { first } = parse('PID|1||1||A^B', 'OBX|1|ST|C^D^L||  spaced  ||||||F');

    expect(first('Observation').valueString).toBe('  spaced  ');
  });

  it('still tolerates a stray byte before MSH, and blank lines between segments', () => {
    const raw = ['  ', `  ${HEADER}`, '', 'PID|1||42||DOE^JOHN', ''].join('\r\n');
    const result = hl7v2Parser.parse(raw);

    expect(result.bundle.entry).toHaveLength(1);
  });
});

describe('addresses and telecom', () => {
  it('keeps an address that is only a state or only a country', () => {
    const { first } = parse('PID|1||1||A^B||||||^^^CA');

    expect(first('Patient').address).toEqual([{ state: 'CA' }]);
  });

  it('marks a work email as work, not home', () => {
    const { first } = parse(
      segment('PID', { 1: '1', 3: '1', 5: 'A^B', 14: '^^NET^work@b.example' }),
    );

    expect(first('Patient').telecom).toEqual([
      { system: 'email', value: 'work@b.example', use: 'work' },
    ]);
  });
});

describe('the message as a whole', () => {
  it('names the segments it skipped rather than dropping them silently', () => {
    // ORC and Z-segments, because NK1 and IN1 have mappers now.
    const { warnings } = parse('PID|1||1||A^B', 'ORC|NW|1', 'ORC|NW|2', 'ZPD|1|local');

    expect(warnings.join()).toContain('2 ORC segments skipped');
    expect(warnings.join()).toContain('1 ZPD segment skipped');
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

describe('an ORU is a report with results, not loose observations', () => {
  /*
   * v2 says which results belong to which order by position: the OBX segments
   * after an OBR are that OBR's, until the next OBR. Nothing inside an OBX
   * names its report, so a per-segment mapper cannot make the link and the
   * grouping has to happen while the segments are walked in order.
   */
  const PID = segment('PID', { 1: '1', 3: '12345^^^MRN^MR', 5: 'DOE^JOHN' });

  const order = (setId: string, filler: string, code: string, status?: string) =>
    segment('OBR', { 1: setId, 3: filler, 4: code, ...(status ? { 25: status } : {}) });

  const result = (setId: string, code: string) =>
    segment('OBX', { 1: setId, 2: 'NM', 3: code, 5: '1', 11: 'F' });

  it('points each report at the results that followed it, and no others', () => {
    const { of } = parse(
      PID,
      order('1', 'FIL-1', '24331-1^Lipid panel^LN', 'F'),
      result('1', '2093-3^Cholesterol^LN'),
      result('2', '2571-8^Triglycerides^LN'),
      order('2', 'FIL-2', '58410-2^CBC panel^LN', 'P'),
      result('3', '718-7^Hemoglobin^LN'),
    );

    const [lipids, cbc] = of('DiagnosticReport');

    expect(lipids?.result).toEqual([
      { reference: 'Observation/observation-1' },
      { reference: 'Observation/observation-2' },
    ]);
    expect(cbc?.result).toEqual([{ reference: 'Observation/observation-3' }]);
    expect(of('Observation')).toHaveLength(3);
  });

  it('references observations that are really in the bundle', () => {
    // A dangling reference would be worse than none: it says a result exists.
    const { of } = parse(
      PID,
      order('1', 'FIL-1', 'X^Y^L'),
      result('1', 'a^b^L'),
      result('2', 'c^d^L'),
    );

    const ids = new Set(of('Observation').map((o) => `Observation/${o.id as string}`));
    const referenced = (of('DiagnosticReport')[0]?.result ?? []) as { reference: string }[];

    expect(referenced).toHaveLength(2);
    for (const { reference } of referenced) expect(ids.has(reference)).toBe(true);
  });

  it('leaves an OBX with no order before it standing on its own', () => {
    // OBX is not only a lab thing, and an observation without a report is a
    // real observation rather than an error.
    const { of } = parse(PID, result('1', 'a^b^L'));

    expect(of('DiagnosticReport')).toEqual([]);
    expect(of('Observation')).toHaveLength(1);
  });

  it('emits a report that produced no results yet', () => {
    const { first, of } = parse(PID, order('1', 'FIL-1', 'X^Y^L', 'I'));

    expect(of('Observation')).toEqual([]);
    expect(first('DiagnosticReport').result).toBeUndefined();
    expect(first('DiagnosticReport').status).toBe('registered');
  });

  it('maps OBR-25 onto the R4 status, and says so when it cannot', () => {
    const cases: [string, string][] = [
      ['F', 'final'],
      ['P', 'preliminary'],
      ['C', 'corrected'],
      ['A', 'partial'],
      ['X', 'cancelled'],
    ];

    for (const [code, expected] of cases) {
      expect(parse(PID, order('1', 'F1', 'X^Y^L', code)).first('DiagnosticReport').status).toBe(
        expected,
      );
    }

    const unknown = parse(PID, order('1', 'F1', 'X^Y^L', 'Q'));
    expect(unknown.first('DiagnosticReport').status).toBe('unknown');
    expect(unknown.warnings.join()).toContain('OBR-25');

    // Absent is not the same as unrecognised, and only one of them warrants a
    // warning.
    const absent = parse(PID, order('1', 'F1', 'X^Y^L'));
    expect(absent.first('DiagnosticReport').status).toBe('unknown');
    expect(absent.warnings.join()).not.toContain('OBR-25');
  });

  it('always writes the code R4 requires, even from a bare OBR', () => {
    const { first } = parse(PID, segment('OBR', { 1: '1', 3: 'FIL-1' }));

    expect(first('DiagnosticReport').code).toEqual({ text: 'Unspecified report' });
    expect(validateBundle(parse(PID, segment('OBR', { 1: '1' })).bundle)).toEqual([]);
  });
});

describe('NK1 and IN1', () => {
  const PID = segment('PID', { 1: '1', 3: '12345', 5: 'DOE^JOHN' });

  it('maps a next of kin onto a RelatedPerson', () => {
    const { first } = parse(
      PID,
      segment('NK1', {
        1: '1',
        2: 'DOE^JANE',
        3: 'SPO^Spouse',
        4: '1 Main St^^Springfield^IL^62704',
        5: '555-1234',
      }),
    );

    const related = first('RelatedPerson');
    expect(related.patient).toEqual({ reference: 'Patient/patient-12345' });
    expect(related.name).toEqual([{ family: 'DOE', given: ['JANE'] }]);
    expect(related.relationship).toEqual([
      { coding: [{ code: 'SPO', display: 'Spouse' }], text: 'Spouse' },
    ]);
    expect(related.address).toHaveLength(1);
  });

  it('maps an insurance segment onto a Coverage that R4 accepts', () => {
    const { first, bundle } = parse(
      PID,
      segment('IN1', {
        1: '1',
        2: 'PLAN1^PPO',
        4: 'AETNA',
        12: '20260101',
        13: '20261231',
        36: 'POL-77',
      }),
    );

    const coverage = first('Coverage');
    expect(coverage.beneficiary).toEqual({ reference: 'Patient/patient-12345' });
    // A Reference carrying only `display` is conformant; inventing an
    // Organization to point at would assert a record the message never sent.
    expect(coverage.payor).toEqual([{ display: 'AETNA' }]);
    expect(coverage.subscriberId).toBe('POL-77');
    expect(coverage.period).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(validateBundle(bundle)).toEqual([]);
  });

  it('fills the required payor when IN1 names no company', () => {
    // `payor` is 1..* in R4, so a Coverage without one is not R4 at all.
    expect(parse(PID, segment('IN1', { 1: '1' })).first('Coverage').payor).toEqual([
      { display: 'Unspecified payor' },
    ]);
  });

  it('skips both when the message has no PID, because R4 requires one', () => {
    // An OBX so the bundle is not empty; Observation.subject is optional, so
    // that one survives a message with no PID and these two do not.
    const { of, warnings } = parse(
      segment('NK1', { 1: '1', 2: 'DOE^JANE' }),
      segment('IN1', { 1: '1' }),
      segment('OBX', { 1: '1', 2: 'ST', 3: 'a^b^L', 5: 'text' }),
    );

    expect(of('RelatedPerson')).toEqual([]);
    expect(of('Coverage')).toEqual([]);
    expect(of('Observation')).toHaveLength(1);
    expect(warnings.join()).toContain('R4 requires a patient on RelatedPerson');
    expect(warnings.join()).toContain('R4 requires a patient on Coverage');
  });

  it('says why the bundle is empty when everything needed the patient', () => {
    /*
     * Reporting "no segment maps to a resource" here would name NK1 as
     * supported in the same breath as having skipped one, sending the reader
     * to look for a mapper that exists.
     */
    expect(() => parse(segment('NK1', { 1: '1' }), segment('IN1', { 1: '1' }))).toThrow(
      /needs a patient R4 requires, and the message has no PID/,
    );
  });

  it('no longer reports these segments as unmapped', () => {
    const { warnings } = parse(PID, segment('NK1', { 1: '1' }), segment('IN1', { 1: '1' }));

    expect(warnings.join()).not.toContain('skipped — this adapter maps');
  });
});
