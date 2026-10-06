import { defineConfig } from "tsup";
import { PUBLIC_SOURCE_GLOBS } from "./scripts/public-surface.mjs";

/**
 * ONE FILE IN, ONE FILE OUT — never a bundle.
 *
 * `"use client"` is per FILE in this package (≈640 runtime modules carry it). A
 * bundle merges modules and esbuild drops a directive it cannot keep, so a
 * bundled build either stamps every module (each pure export becomes a client
 * reference inside a React Server Component) or none (every hook-using
 * component becomes a server build error). `bundle: false` transpiles each
 * module alone, so each `.js` in `dist/` starts with exactly the directive its
 * source did; `scripts/finish-build.mjs` makes every specifier explicit and
 * `scripts/verify-tarball.mjs` proves both halves on the packed artifact.
 *
 * It also keeps every lazy door lazy: the app's `next/dynamic` imports point at
 * one module each, and a bundle would fold them into their parent chunk.
 *
 * Types come from `tsc --emitDeclarationOnly` (tsconfig.build.json): tsup's
 * rollup dts pass cannot hold ≈1,950 entries in memory.
 */
export default defineConfig({
  entry: PUBLIC_SOURCE_GLOBS,
  outDir: "dist",
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  bundle: false,
  splitting: false,
  treeshake: false,
  sourcemap: false,
  dts: false,
  clean: false,
  outExtension: () => ({ js: ".js" }),
});
