import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root. Without this, Turbopack walks up and can latch
  // onto an unrelated lockfile outside the repo.
  turbopack: { root: path.join(import.meta.dirname, '..') },
  // The library is consumed from the workspace as TypeScript-built ESM; Next
  // transpiles it so the demo always tracks the source, never a stale publish.
  transpilePackages: ['fhir-normalize'],
};

export default nextConfig;
