import type { Observation, Patient } from 'fhir/r4';
import { describe, expectTypeOf, it } from 'vitest';
import type { NormalizedName, NormalizedQuantity, NormalizedReference } from './types';
import { simplifyResource } from './utils';

/**
 * Type-level assertions. These never run — `expectTypeOf` is erased — but they
 * fail the suite at typecheck time, which is the only place a wrong type shows.
 */
describe('simplifyResource infers fields from the resource type', () => {
  it('gives a Patient its own fields', () => {
    const { fields } = simplifyResource({} as Patient);

    expectTypeOf(fields.name).toEqualTypeOf<NormalizedName[] | undefined>();
    expectTypeOf(fields.gender).toExtend<{ text: string } | undefined>();
  });

  it('narrows a choice to the types R4 permits there', () => {
    const { fields } = simplifyResource({} as Observation);

    // R4 Observation.value[x] allows Quantity but not Reference. Asserted by
    // assignability *into* the field: `not.toExtend` the other way round
    // passes trivially, because `undefined` is a member of both sides.
    expectTypeOf<NormalizedQuantity>().toExtend<typeof fields.value>();
    expectTypeOf<NormalizedReference>().not.toExtend<typeof fields.value>();
  });

  it('falls back to the loose map when the type is not known', () => {
    const { fields } = simplifyResource(JSON.parse('{}') as unknown);

    expectTypeOf(fields.anythingAtAll).not.toBeNever();
  });
});
