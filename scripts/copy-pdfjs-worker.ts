/**
 * scripts/copy-pdfjs-worker.ts
 *
 * Mirror the installed pdfjs-dist worker into `public/pdfjs/` so it's
 * served same-origin. PdfDocumentRenderer's worker source is hard-coded
 * to `/pdfjs/pdf.worker.min.mjs` — keep this in sync if you ever
 * rename the destination.
 *
 * Why same-origin: the blob-cache Service Worker only intercepts fetches
 * for our own origin. An unpkg-hosted worker (the historical default)
 * also triggers a separate cross-origin worker initialization fetch
 * that introduces variability between environments. Mirroring the
 * worker bytes locally turns pdfjs into a self-contained dependency
 * with one fewer external point of failure.
 *
 * Invoked by the `pnpm build` chain. Idempotent — running twice is a
 * no-op if the destination already matches.
 */

import { mkdirSync, copyFileSync, statSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SRC = resolve(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const DEST_DIR = resolve(ROOT, "public/pdfjs");
const DEST = resolve(DEST_DIR, "pdf.worker.min.mjs");

if (!existsSync(SRC)) {
  console.error(
    `[copy-pdfjs-worker] Source missing: ${SRC}\n` +
      `Did you install dependencies? Run \`pnpm install\` first.`,
  );
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });

const srcStat = statSync(SRC);
if (existsSync(DEST)) {
  const destStat = statSync(DEST);
  if (destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) {
    console.log(
      `[copy-pdfjs-worker] up-to-date (${(srcStat.size / 1024).toFixed(1)} KB)`,
    );
    process.exit(0);
  }
}

copyFileSync(SRC, DEST);
console.log(
  `[copy-pdfjs-worker] wrote public/pdfjs/pdf.worker.min.mjs ` +
    `(${(srcStat.size / 1024).toFixed(1)} KB)`,
);
