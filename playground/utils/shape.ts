import {
  BASE_SHAPE,
  CLINICAL_SHAPE,
  DESCRIBE_FORMAT,
  FOUNDATION_SHAPE,
  formatShape,
  shapeFor,
} from 'fhir-normalize/simplified';
import { SHAPE_FORMAT, SHAPE_SECTION } from '@/constants';
import type { ShapeFormat, ShapeGroup } from '@/types';

/**
 * Resource types grouped by the section they belong to in the FHIR resource
 * list, so the picker reads the way the spec does rather than as 74 flat names.
 */
export const shapeGroups = (): ShapeGroup[] =>
  [
    { label: SHAPE_SECTION.BASE, table: BASE_SHAPE },
    { label: SHAPE_SECTION.CLINICAL, table: CLINICAL_SHAPE },
    { label: SHAPE_SECTION.FOUNDATION, table: FOUNDATION_SHAPE },
  ].map(({ label, table }) => ({ label, resourceTypes: Object.keys(table).sort() }));

/** True when the type has a declared shape, so the picker can prefer it. */
export const hasShape = (resourceType: string | undefined): boolean =>
  resourceType !== undefined && shapeFor(resourceType) !== undefined;

/**
 * The rendered structure for a resource type.
 *
 * The Normalized tab shows what one payload became; this shows what every
 * payload of that type produces, which is what you model against.
 */
export const renderShape = (resourceType: string, format: ShapeFormat): string | null =>
  formatShape(
    resourceType,
    format === SHAPE_FORMAT.TYPESCRIPT ? DESCRIBE_FORMAT.TYPESCRIPT : DESCRIBE_FORMAT.TREE,
  );
