#!/usr/bin/env tsx
/**
 * check-content-ir-twin — frontend-side drift check for the twinned Content IR
 * kernel (features/content-ir → aidream/apps/shared/content-ir-core).
 *
 * aidream's TWIN_MANIFEST.json pins the SHA-256 of every frontend source file
 * the twin was generated from. This script re-hashes those frontend sources
 * and screams when any differs — meaning the kernel was edited here without
 * re-running aidream's `python scripts/sync_content_ir_core.py` (the twin is
 * now stale). It never touches aidream files; it only READS the manifest.
 *
 *   pnpm check:content-ir:twin        # exit 1 on drift or stale manifest
 *   AIDREAM_ROOT=/path/to/aidream …   # override the default sibling path
 *
 * When aidream is not checked out, the check cannot run — it degrades LOUDLY
 * (banner on stderr) but exits 0, because machines without aidream cannot
 * resolve the drift either way. CI runners with both repos get the real gate.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AIDREAM_ROOT = process.env.AIDREAM_ROOT ?? resolve(ROOT, "..", "aidream");
const TWIN_MANIFEST_PATH = resolve(
  AIDREAM_ROOT,
  "apps/shared/content-ir-core/TWIN_MANIFEST.json",
);

interface TwinManifestFileEntry {
  source: string;
  dest: string;
  source_sha256: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  console.error(`\x1b[31m\x1b[1mCONTENT-IR TWIN CHECK FAILED:\x1b[0m ${message}`);
  process.exit(1);
}

function main(): void {
  if (!existsSync(TWIN_MANIFEST_PATH)) {
    console.error(
      [
        "\x1b[33m\x1b[1m╔══════════════════════════════════════════════════════════════════╗",
        "║ CONTENT-IR TWIN CHECK SKIPPED — aidream repo not found            ║",
        "╚══════════════════════════════════════════════════════════════════╝\x1b[0m",
        `  expected manifest at ${TWIN_MANIFEST_PATH}`,
        "  Twin drift CANNOT be verified on this machine. If you edited any",
        "  twinned kernel file (features/content-ir core/session/registry/convert),",
        "  run aidream's `python scripts/sync_content_ir_core.py` before shipping.",
        "  Set AIDREAM_ROOT if aidream lives elsewhere.",
      ].join("\n"),
    );
    process.exit(0);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(TWIN_MANIFEST_PATH, "utf8"));
  } catch (err) {
    fail(`TWIN_MANIFEST.json unparseable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(manifest) || !Array.isArray(manifest.files)) {
    fail("TWIN_MANIFEST.json has no files[] array — did the twin format change?");
  }

  const entries: TwinManifestFileEntry[] = manifest.files.map((entry, i) => {
    if (!isRecord(entry)) fail(`files[${i}] is not an object`);
    const { source, dest, source_sha256 } = entry;
    if (typeof source !== "string" || typeof dest !== "string" || typeof source_sha256 !== "string") {
      fail(`files[${i}] missing source/dest/source_sha256 strings`);
    }
    return { source, dest, source_sha256 };
  });
  if (entries.length === 0) fail("TWIN_MANIFEST.json pins zero files");

  const drifted: string[] = [];
  const missing: string[] = [];
  for (const entry of entries) {
    const path = resolve(ROOT, entry.source);
    if (!existsSync(path)) {
      missing.push(entry.source);
      continue;
    }
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (hash !== entry.source_sha256) drifted.push(entry.source);
  }

  if (missing.length > 0 || drifted.length > 0) {
    console.error(`\x1b[31m\x1b[1m✗ content-ir twin drift (${drifted.length + missing.length} file(s)):\x1b[0m`);
    for (const f of drifted) console.error(`    edited since last twin sync: ${f}`);
    for (const f of missing) console.error(`    pinned by twin manifest but MISSING here: ${f}`);
    console.error(
      "  The aidream twin (apps/shared/content-ir-core) is stale. From the aidream repo root run:\n" +
        "    python scripts/sync_content_ir_core.py\n" +
        "  then commit BOTH repos. Never edit the twin files directly in aidream.",
    );
    process.exit(1);
  }

  console.log(
    `\x1b[32m\x1b[1m✓ content-ir twin:\x1b[0m ${entries.length} pinned kernel files match aidream's TWIN_MANIFEST.json`,
  );
}

main();
