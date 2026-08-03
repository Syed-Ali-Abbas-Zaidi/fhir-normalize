import { defineConfig } from 'tsup';

export default defineConfig({
  /**
   * Three entry points, not one.
   *
   * Bundling everything into a single module leaves a bundler nothing to cut
   * along: `sideEffects: false` can drop a whole module but not part of one,
   * so a consumer who only called `parse()` still shipped all 74 resource
   * shapes. Separate entries plus splitting keep the heavy tables out of the
   * core path.
   */
  entry: {
    index: 'src/index.ts',
    simplified: 'src/simplified/index.ts',
    deidentify: 'src/deidentify/index.ts',
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
