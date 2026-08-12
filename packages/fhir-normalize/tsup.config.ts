import { defineConfig } from 'tsup';

export default defineConfig({
  /**
   * Seven entry points, not one.
   *
   * Bundling everything into a single module leaves a bundler nothing to cut
   * along: `sideEffects: false` can drop a whole module but not part of one,
   * so a consumer who only called `parse()` still shipped all 147 resource
   * shapes. Separate entries plus splitting keep the heavy tables out of the
   * core path, and keep `fast-xml-parser` — which is not side-effect-free, so
   * no bundler can drop it — out of anything that does not parse XML.
   */
  entry: {
    index: 'src/index.ts',
    simplified: 'src/simplified/index.ts',
    deidentify: 'src/deidentify/index.ts',
    xml: 'src/parsers/fhir-xml/index.ts',
    validate: 'src/validate/index.ts',
    stream: 'src/stream/index.ts',
    hl7v2: 'src/parsers/hl7v2/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  target: 'es2022',
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
