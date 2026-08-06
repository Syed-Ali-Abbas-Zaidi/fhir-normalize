import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * Type-level assertions run alongside the runtime suite. The generated
     * per-resource field types are only wrong at compile time, so nothing else
     * would catch a mistake in them.
     */
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test-d.ts',
        'src/**/__fixtures__/**',
        // Generated: types only, nothing to execute.
        'src/simplified/fields.generated.ts',
      ],
    },
  },
});
