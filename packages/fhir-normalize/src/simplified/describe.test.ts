import { describe, expect, it } from 'vitest';
import { DESCRIBE_FORMAT, FIELD_KIND, VALUE_KIND } from './constants';
import { describeShape, formatShape, listShapes, valueProperties } from './describe';
import { simplifyResource } from './utils';

const fieldNamed = (resourceType: string, name: string) =>
  describeShape(resourceType)?.fields.find((field) => field.name === name);

describe('describeShape', () => {
  it('describes a resource without needing a payload', () => {
    const description = describeShape('Observation');

    expect(description?.resourceType).toBe('Observation');
    expect(description?.fields.length).toBeGreaterThan(10);
  });

  it('marks repeating fields as lists', () => {
    expect(fieldNamed('Observation', 'category')?.list).toBe(true);
    expect(fieldNamed('Observation', 'code')?.list).toBe(false);
  });

  it('reports a choice field with every kind it can resolve to', () => {
    const value = fieldNamed('Observation', 'value');

    expect(value?.kind).toBe(FIELD_KIND.CHOICE);
    expect(value?.valueKinds).toContain(VALUE_KIND.QUANTITY);
    expect(value?.valueKinds).toContain(VALUE_KIND.CONCEPT);
    expect(value?.valueKinds).toContain(VALUE_KIND.RANGE);
  });

  it('describes nested backbone elements', () => {
    const component = fieldNamed('Observation', 'component');

    expect(component?.kind).toBe(FIELD_KIND.GROUP);
    expect(component?.fields.map((field) => field.name)).toContain('value');
  });

  it('resolves a renamed resource type and says what it reuses', () => {
    const description = describeShape('DeviceUsage');

    expect(description?.aliasOf).toBe('DeviceUseStatement');
  });

  it('reports null for a resource type with no shape', () => {
    expect(describeShape('NotARealResource')).toBeNull();
    expect(formatShape('NotARealResource')).toBeNull();
  });
});

describe('valueProperties — derived, not hand-listed', () => {
  it('matches what simplifyResource actually produces', () => {
    const { fields } = simplifyResource({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Body Weight' },
      valueQuantity: { value: 74.5, unit: 'kg' },
    });

    expect(Object.keys(fields.value as object).sort()).toEqual(
      valueProperties(VALUE_KIND.QUANTITY).sort(),
    );
  });

  it('always includes the two guaranteed properties', () => {
    for (const kind of Object.values(VALUE_KIND)) {
      expect(valueProperties(kind)).toContain('kind');
      expect(valueProperties(kind)).toContain('text');
    }
  });
});

describe('formatShape — tree', () => {
  const tree = formatShape('Observation') ?? '';

  it('leads with the resource type', () => {
    expect(tree.startsWith('Observation')).toBe(true);
  });

  it('lists fields with their type', () => {
    expect(tree).toMatch(/code\s+concept/);
    expect(tree).toMatch(/category\s+concept\[\]/);
    expect(tree).toMatch(/value\s+choice/);
  });

  it('indents nested group fields', () => {
    expect(tree).toMatch(/component\s+group\[\]/);
  });

  it('explains only the value shapes the resource actually uses', () => {
    const legend = tree.split('value shapes')[1] ?? '';

    expect(legend).toContain('concept');
    // Reachable only through a choice, so it would be noise in the legend.
    expect(legend.split('resolved at runtime')[0]).not.toContain('address ');
  });

  it('notes how primitive and choice resolve at runtime', () => {
    expect(tree).toContain('resolved at runtime');
    expect(tree).toMatch(/primitive\s+resolves to/);
  });
});

describe('formatShape — typescript', () => {
  const ts = formatShape('Observation', DESCRIBE_FORMAT.TYPESCRIPT) ?? '';

  it('emits a named interface', () => {
    expect(ts).toContain('interface SimplifiedObservation {');
  });

  it('types every member optional, since absent fields are omitted', () => {
    expect(ts).toContain('code?: NormalizedConcept;');
    expect(ts).toContain('category?: NormalizedConcept[];');
  });

  it('types a choice as the value union', () => {
    expect(ts).toContain('value?: NormalizedValue;');
  });

  it('nests a group as an inline object array', () => {
    expect(ts).toMatch(/component\?: \{/);
  });

  it('references type names the package actually exports', () => {
    const referenced = [...ts.matchAll(/Normalized[A-Za-z]+/g)].map((match) => match[0]);

    expect(new Set(referenced).size).toBeGreaterThan(1);
    expect(referenced).toContain('NormalizedValue');
  });

  it('names the interface after the canonical type for an alias', () => {
    expect(formatShape('DeviceUsage', DESCRIBE_FORMAT.TYPESCRIPT)).toContain(
      'interface SimplifiedDeviceUseStatement {',
    );
  });
});

describe('listShapes', () => {
  it('lists every declared resource type, sorted', () => {
    const shapes = listShapes();

    expect(shapes).toContain('Observation');
    expect(shapes).toContain('CarePlan');
    expect([...shapes].sort()).toEqual(shapes);
  });

  it('every listed type can be described and rendered', () => {
    for (const resourceType of listShapes()) {
      expect(describeShape(resourceType), resourceType).not.toBeNull();
      expect(formatShape(resourceType), resourceType).toBeTruthy();
      expect(formatShape(resourceType, DESCRIBE_FORMAT.TYPESCRIPT), resourceType).toBeTruthy();
    }
  });
});
