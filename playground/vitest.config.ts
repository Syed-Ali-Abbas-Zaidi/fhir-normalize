import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    alias: { '@': resolve(import.meta.dirname, '.') },
  },
});
