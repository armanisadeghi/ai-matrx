#!/usr/bin/env tsx
/**
 * export-kind-surfaces — the detector-table generator (Content IR Wave 1,
 * project C2 / P11 "registry-generated detection").
 *
 * Reads the ONE enumerable input-surface list — live `content_ir.kind_surface`
 * (SHAPE_SYSTEM.md R2) — and emits the compiled detector bootstraps for BOTH
 * runtimes:
 *
 *   · matrx-frontend  features/content-ir/registry/system-surfaces.generated.ts
 *       — imported by system-surfaces.ts as the surface registry's pre-warm
 *         compiled floor (replaces the hand-maintained entry array).
 *   · aidream         packages/matrx-ai/matrx_ai/processing/blocks/kind_surfaces_generated.py
 *       — the Python-side detection-constants table (consumed by the
 *         kind-surface reconciliation tests until the Wave-2 enforcement
 *         ratchet swaps it into the hosts).
 *
 * Byte-identical semantics across runtimes: both files embed the SAME
 * canonical compact-JSON payload (single-quoted, guaranteed quote/backslash
 * free) and derive their native structures from it. The `--check` mode (and
 * the aidream parity test) compares the embedded payloads byte-for-byte.
 *
 * Generation is a dev/CI step, never runtime: an unreachable DB FAILS LOUDLY.
 * Only live rows (is_active AND not deleted) are exported — matching the
 * registry's warm-merge filter, so the compiled floor can never resurrect a
 * deactivated surface.
 *
 *   pnpm check:shapes:surfaces:refresh   # regenerate + write both files
 *   pnpm check:shapes:surfaces           # regenerate in-memory, diff vs the
 *                                        #   committed files + cross-runtime
 *                                        #   parity, exit 1 on any drift
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AIDREAM_ROOT = process.env.AIDREAM_ROOT ?? resolve(ROOT, "..", "aidream");
const FE_OUT = resolve(ROOT, "features/content-ir/registry/system-surfaces.generated.ts");
const PY_OUT = resolve(
  AIDREAM_ROOT,
  "packages/matrx-ai/matrx_ai/processing/blocks/kind_surfaces_generated.py",
);

/** Marker both generated files carry around the canonical payload. */
export const BOOTSTRAP_JSON_MARKER = "KIND_SURFACE_BOOTSTRAP_JSON";

/** One exported surface row — fixed key order = deterministic payload. */
export interface ExportedSurfaceRow {
  surface_type: string;
  token: string;
  kind: string;
  parser_strategy: string;
  streaming: boolean;
}

function fail(message: string): never {
  console.error(`\x1b[31m\x1b[1mKIND-SURFACE EXPORT FAILED:\x1b[0m ${message}`);
  process.exit(2);
}

async function fetchLiveSurfaces(): Promise<ExportedSurfaceRow[]> {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local) — generation NEEDS the live DB");
  }
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_surface")
    .select(
      "surface_type, token, parser_strategy, streaming, kind_definition:kind_definition_id(kind)",
    )
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) fail(`read content_ir.kind_surface: ${error.message}`);

  const rows: ExportedSurfaceRow[] = [];
  for (const raw of (data ?? []) as unknown[]) {
    // Ingress narrowing (untyped service-key client): checks, never assertions.
    const row = raw as Record<string, unknown>;
    const kindRef = row.kind_definition as Record<string, unknown> | null | undefined;
    const kind = kindRef?.kind;
    if (
      typeof row.surface_type !== "string" ||
      typeof row.token !== "string" ||
      typeof row.parser_strategy !== "string" ||
      typeof row.streaming !== "boolean" ||
      typeof kind !== "string" ||
      kind === ""
    ) {
      fail(
        `malformed kind_surface row (${String(row.surface_type)}, "${String(row.token)}") — fix the row, the bootstrap never ships a hole`,
      );
    }
    rows.push({
      surface_type: row.surface_type,
      token: row.token.toLowerCase(),
      kind,
      parser_strategy: row.parser_strategy,
      streaming: row.streaming,
    });
  }
  if (rows.length === 0) fail("live kind_surface returned zero active rows — refusing to emit an empty bootstrap");

  rows.sort((a, b) =>
    a.surface_type === b.surface_type
      ? a.token.localeCompare(b.token)
      : a.surface_type.localeCompare(b.surface_type),
  );
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.surface_type} ${r.token}`;
    if (seen.has(k)) fail(`duplicate live surface (${k}) — UNIQUE(surface_type, token) is violated`);
    seen.add(k);
  }
  return rows;
}

interface GeneratedArtifacts {
  stamp: string;
  payload: string;
  feContent: string;
  pyContent: string;
}

function buildArtifacts(rows: ExportedSurfaceRow[]): GeneratedArtifacts {
  // Compact canonical JSON — the ONE payload both runtimes embed verbatim.
  const payload = JSON.stringify(rows);
  if (/['\\`$]/.test(payload)) {
    fail("canonical payload contains a quote/backslash/backtick/dollar — token vocabulary broke the embedding contract");
  }
  const stamp = `${rows.length}-surfaces+${createHash("sha256").update(payload).digest("hex").slice(0, 12)}`;

  const feEntries = rows
    .map(
      (r) =>
        `  {\n    surfaceType: "${r.surface_type}",\n    token: "${r.token}",\n    kind: "${r.kind}",\n    parserStrategy: "${r.parser_strategy}",\n    streaming: ${r.streaming},\n  },`,
    )
    .join("\n");

  const feContent = `/**
 * GENERATED by pnpm check:shapes:surfaces:refresh
 * (scripts/shape/export-kind-surfaces.ts) — DO NOT HAND-EDIT.
 *
 * Compiled bootstrap of live \`content_ir.kind_surface\` (active rows only) —
 * the surface registry's pre-warm floor. Adding/removing a detection surface
 * happens in the DB (shape-system skill), then regenerate; never edit here.
 * Twin payload: aidream packages/matrx-ai/matrx_ai/processing/blocks/
 * kind_surfaces_generated.py — byte-identical ${BOOTSTRAP_JSON_MARKER}.
 */

import type { KindSurfaceEntry, KindSurfaceType } from "./system-surfaces";

export const KIND_SURFACE_BOOTSTRAP_STAMP = "${stamp}";

/** Canonical cross-runtime payload — compare byte-for-byte with the Python twin. */
export const ${BOOTSTRAP_JSON_MARKER} = '${payload}';

export const GENERATED_SURFACE_ENTRIES: readonly KindSurfaceEntry[] = [
${feEntries}
];

/**
 * Parity guard: the typed entries above are generated from the same rows as
 * the canonical payload. This re-derivation lets tests prove it without
 * trusting the generator.
 */
export function entriesFromBootstrapJson(): KindSurfaceEntry[] {
  const parsed: unknown = JSON.parse(${BOOTSTRAP_JSON_MARKER});
  if (!Array.isArray(parsed)) throw new Error("kind-surface bootstrap payload is not an array");
  return parsed.map((row) => {
    const r = row as Record<string, unknown>;
    if (
      typeof r.surface_type !== "string" ||
      typeof r.token !== "string" ||
      typeof r.kind !== "string" ||
      typeof r.parser_strategy !== "string" ||
      typeof r.streaming !== "boolean"
    ) {
      throw new Error("kind-surface bootstrap payload row is malformed");
    }
    return {
      surfaceType: r.surface_type as KindSurfaceType,
      token: r.token,
      kind: r.kind,
      parserStrategy: r.parser_strategy,
      streaming: r.streaming,
    };
  });
}
`;

  const pyContent = `"""GENERATED by matrx-frontend \`pnpm check:shapes:surfaces:refresh\`
(scripts/shape/export-kind-surfaces.ts) -- DO NOT HAND-EDIT.

Compiled bootstrap of live \`\`content_ir.kind_surface\`\` (active rows only) --
the Python-side detection-constants table. Twin payload: matrx-frontend
features/content-ir/registry/system-surfaces.generated.ts -- byte-identical
${BOOTSTRAP_JSON_MARKER}. Consumed by the kind-surface reconciliation tests
(tests/test_kind_surface_bootstrap.py) until the Wave-2 enforcement ratchet
swaps it into the detection hosts.
"""

from __future__ import annotations

import json
from typing import Any

KIND_SURFACE_BOOTSTRAP_STAMP = "${stamp}"

# Canonical cross-runtime payload -- compare byte-for-byte with the TS twin.
${BOOTSTRAP_JSON_MARKER} = '${payload}'

# One dict per live surface: surface_type, token, kind, parser_strategy, streaming.
KIND_SURFACE_ENTRIES: tuple[dict[str, Any], ...] = tuple(
    json.loads(${BOOTSTRAP_JSON_MARKER})
)

_BY_TYPE_AND_TOKEN: dict[tuple[str, str], dict[str, Any]] = {
    (entry["surface_type"], entry["token"]): entry for entry in KIND_SURFACE_ENTRIES
}


def get_surface(surface_type: str, token: str) -> dict[str, Any] | None:
    """The registered surface for (surface_type, token), or None."""
    return _BY_TYPE_AND_TOKEN.get((surface_type, token.lower()))


def get_surface_for_tag(tag: str) -> dict[str, Any] | None:
    return get_surface("xml_tag", tag)


def get_surface_for_fence(lang: str) -> dict[str, Any] | None:
    return get_surface("fence_lang", lang)


def get_surface_for_json_root_key(root_key: str) -> dict[str, Any] | None:
    return get_surface("json_root_key", root_key)
`;

  return { stamp, payload, feContent, pyContent };
}

/** Extract the embedded canonical payload from a generated file's text. */
export function extractBootstrapPayload(text: string): string | null {
  const m = new RegExp(`${BOOTSTRAP_JSON_MARKER} = '([^']*)'`).exec(text);
  return m ? m[1] : null;
}

async function main(): Promise<number> {
  const check = process.argv.slice(2).includes("--check");
  const rows = await fetchLiveSurfaces();
  const { stamp, payload, feContent, pyContent } = buildArtifacts(rows);

  let failures = 0;
  const diffOne = (path: string, content: string, label: string): void => {
    if (!existsSync(path)) {
      console.error(
        `\x1b[31m\x1b[1m✗ ${label} bootstrap missing\x1b[0m (${path}) — run pnpm check:shapes:surfaces:refresh and commit BOTH repos`,
      );
      failures += 1;
      return;
    }
    const committed = readFileSync(path, "utf8");
    if (committed !== content) {
      console.error(
        `\x1b[31m\x1b[1m✗ ${label} bootstrap drift\x1b[0m — ${path} differs from live content_ir.kind_surface (${stamp}); run pnpm check:shapes:surfaces:refresh and commit BOTH repos`,
      );
      failures += 1;
    }
  };

  if (check) {
    diffOne(FE_OUT, feContent, "frontend");
    diffOne(PY_OUT, pyContent, "aidream");
    // Cross-runtime parity — the committed twins must carry the SAME payload.
    if (existsSync(FE_OUT) && existsSync(PY_OUT)) {
      const fePayload = extractBootstrapPayload(readFileSync(FE_OUT, "utf8"));
      const pyPayload = extractBootstrapPayload(readFileSync(PY_OUT, "utf8"));
      if (fePayload === null || pyPayload === null) {
        console.error(
          `\x1b[31m\x1b[1m✗ parity check blind\x1b[0m — ${BOOTSTRAP_JSON_MARKER} marker missing from a committed bootstrap`,
        );
        failures += 1;
      } else if (fePayload !== pyPayload) {
        console.error(
          "\x1b[31m\x1b[1m✗ cross-runtime parity broken\x1b[0m — the TS and Python bootstraps embed DIFFERENT payloads; regenerate BOTH from one run",
        );
        failures += 1;
      }
    }
  } else {
    if (!existsSync(dirname(PY_OUT))) {
      fail(`aidream not found at ${AIDREAM_ROOT} (set AIDREAM_ROOT) — both runtimes regenerate together or not at all`);
    }
    writeFileSync(FE_OUT, feContent);
    console.log(`  wrote ${FE_OUT}`);
    writeFileSync(PY_OUT, pyContent);
    console.log(`  wrote ${PY_OUT}`);
  }

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.surface_type, (counts.get(r.surface_type) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t} ${n}`)
    .join(" / ");
  if (failures === 0) {
    console.log(
      `\x1b[32m\x1b[1m✓ kind-surface bootstrap:\x1b[0m ${rows.length} live surfaces (${summary}) — ${stamp}`,
    );
    return 0;
  }
  console.error(
    `\x1b[31m\x1b[1mkind-surface bootstrap:\x1b[0m ${rows.length} live surfaces · ${failures} failure(s)`,
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `\x1b[31m\x1b[1mexport-kind-surfaces FAILED:\x1b[0m`,
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  });
