#!/usr/bin/env node
/**
 * Runs before `npm pack` / `npm publish`.
 *
 * Two jobs:
 *  1. Refuse to publish without a build. `files: ["dist"]` silently produces an
 *     empty package if `dist/` is missing, which is worse than a failed publish.
 *  2. Copy the repo-root README and LICENSE into the package. npm only picks
 *     those up from the package directory, so without this the npm page is
 *     blank and an MIT package ships with no licence text.
 */
import { access, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(packageDir, '..', '..');

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const built = await exists(join(packageDir, 'dist', 'index.js'));
if (!built) {
  console.error('prepack: dist/ is missing. Run `pnpm --filter fhir-normalize build` first.');
  process.exit(1);
}

for (const file of ['README.md', 'LICENSE']) {
  await copyFile(join(repoRoot, file), join(packageDir, file));
  console.log(`prepack: copied ${file} into the package`);
}
