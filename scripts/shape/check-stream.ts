/**
 * THE STREAM CHECKER — replay EVERY kind's canonical example through the real
 * streaming pipeline and report what the reader would actually see.
 *
 * Arman, 2026-08-24: "I'm having a lot of issues with coding agents not
 * properly creating the kind components, and I find out when it's too late …
 * imagine if we have a thousand of these, I don't want a human or an AI to go
 * through this a thousand times."
 *
 * This is the cheap half of that answer, and it needs NO BROWSER. The Stream
 * tab's engine is pure: build the wire text, chunk it, feed the REAL
 * `StreamBlockAccumulator`, route each upsert through the REAL
 * `applyIrKindRoute`, and derive verdicts from the records. Everything that
 * decides "loader or real component, and when" is decided in that pure path,
 * so it runs for every kind in one process in seconds.
 *
 * What still needs a browser (a later slice): whether the loader VISUALLY
 * renders, duplicate titles, and whether the progressive fill LOOKS right.
 * Those get screenshots + an AI reviewer; this checker is what keeps that
 * expensive pass small by finding the mechanical failures first.
 *
 * Usage:  pnpm check:shapes:stream [--strict] [--kind <slug>] [--limit N]
 *   --strict  exit non-zero when any ACTIVE kind fails a law
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import type { RenderBlockPayload } from "../../types/python-generated/stream-events";
import { StreamBlockAccumulator } from "../../features/agents/redux/execution-system/utils/stream-block-accumulator";
import { applyIrKindRoute } from "../../features/content-ir/react/kind-route";
import { kindRegistry } from "../../features/content-ir/registry/kind-registry";
import { componentRegistry } from "../../features/content-ir/registry/component-registry";
import type { KindComponentProjection } from "../../features/content-ir/registry/schema-source-kind-components";
import {
  buildWireText,
  chunkWireText,
  deriveLoadingVerdicts,
  deriveStreamVerdicts,
  recordFromUpsert,
  type StreamTickRecord,
} from "../../features/content-ir/studio/stream-simulator";
import { readAllRows } from "../../lib/supabase/readAllRows";
import type { Json } from "../../types/database.types";
import { isJsonObject } from "../../types/json";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: resolve(ROOT, ".env.local") });

const SNAPSHOT_PATH = resolve(ROOT, "scripts/shape/stream-status.json");
const MARKDOWN_PATH = resolve(ROOT, "features/content-ir/docs/STREAM_STATUS.md");

const CHUNK_SIZE = 24;

/** Machine-minted data-only I/O contracts never reach a reader. */
const CONTRACT_RE =
  /^(?:action_io|tool_io|workflow_io|agent_io)_.+_[0-9a-f]{8}_(?:input|output)$/;
const CONTRACT_FAMILIES = new Set(["action_io", "tool_io", "workflow_io", "agent_io"]);

interface KindRow {
  id: string;
  kind: string;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

interface ExampleRow {
  kind_definition_id: string;
  data: unknown;
  is_canonical: boolean;
}

export interface StreamCheckResult {
  kind: string;
  isActive: boolean;
  /** Verdict flags — every one of these is a LAW, not a preference. */
  detectedWhileStreaming: boolean;
  kindResolvedWhileStreaming: boolean;
  noRawJsonFlash: boolean;
  completedAsKind: boolean;
  loaderShownFirst: boolean;
  realComponentWhileStreaming: boolean;
  loaderNeverReturns: boolean;
  growthSteps: number;
  firstUnitChunk: number | null;
  totalChunks: number;
  /** Failed law names — empty means the kind streams correctly. */
  failures: string[];
}

/** Run ONE kind's example through the real pipeline. */
export function checkKindStream(
  kind: string,
  example: unknown,
  isActive: boolean,
): StreamCheckResult {
  const records: StreamTickRecord[] = [];
  const wire = buildWireText(example as Record<string, unknown>, kind, "bare");
  const chunks = chunkWireText(wire, CHUNK_SIZE);

  let chunkNo = 0;
  const accumulator = new StreamBlockAccumulator(`check-${kind}`, (payload) => {
    const block = payload.block as RenderBlockPayload;
    const record = recordFromUpsert(chunkNo, block);
    // Route exactly as BlockRenderer does, so the loader/real-component
    // decision in the verdicts is the REAL one.
    const routed = applyIrKindRoute({
      type: block.type,
      content: block.content ?? "",
      serverData: block.data ?? undefined,
      metadata: block.metadata,
    });
    record.routed = {
      type: routed.type,
      hasServerData: routed.serverData !== undefined,
    };
    records.push(record);
    return payload;
  });
  const dispatch = (a: unknown) => a;

  for (const chunk of chunks) {
    chunkNo += 1;
    accumulator.ingest(chunk, dispatch);
  }
  chunkNo += 1;
  accumulator.finalize(dispatch);

  const stream = deriveStreamVerdicts(records, kind);
  const loading = deriveLoadingVerdicts(records, kind);

  const failures: string[] = [];
  if (!stream.detectedWhileStreaming) failures.push("never-detected");
  if (!stream.kindResolvedWhileStreaming) failures.push("kind-not-resolved-live");
  if (stream.rawTextFlash) failures.push("raw-json-flash");
  if (!stream.completedAsKind) failures.push("did-not-complete-as-kind");
  if (!loading.loaderNeverReturns) failures.push("loader-flicker");
  if (!loading.realComponentWhileStreaming) failures.push("no-live-render");

  return {
    kind,
    isActive,
    detectedWhileStreaming: stream.detectedWhileStreaming,
    kindResolvedWhileStreaming: stream.kindResolvedWhileStreaming,
    noRawJsonFlash: !stream.rawTextFlash,
    completedAsKind: stream.completedAsKind,
    loaderShownFirst: loading.loaderShownFirst,
    realComponentWhileStreaming: loading.realComponentWhileStreaming,
    loaderNeverReturns: loading.loaderNeverReturns,
    growthSteps: stream.growthSteps,
    firstUnitChunk: loading.firstUnitChunk,
    totalChunks: chunks.length,
    failures,
  };
}

function isContract(kind: string, metadata: Record<string, unknown> | null): boolean {
  return (
    CONTRACT_RE.test(kind) ||
    CONTRACT_FAMILIES.has(String((metadata ?? {}).family ?? ""))
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const kindArg = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : null;
  const limitArg = args.includes("--limit")
    ? Number(args[args.indexOf("--limit") + 1])
    : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)");
  }
  const supabase = createClient(url, key);

  // Completeness reads: a PostgREST-truncated list silently drops kinds off
  // the report, which reads as "everything passes" (CLAUDE.md's readAllRows law).
  const [kinds, examples] = await Promise.all([
    readAllRows<KindRow>(
      ({ from, to }) =>
        supabase
          .schema("content_ir")
          .from("kind_definition")
          .select("id,kind,is_active,metadata", { count: "exact" })
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content_ir.kind_definition" },
    ),
    readAllRows<ExampleRow>(
      ({ from, to }) =>
        supabase
          .schema("content_ir")
          .from("kind_example")
          .select("kind_definition_id,data,is_canonical", { count: "exact" })
          .is("deleted_at", null)
          .order("kind_definition_id", { ascending: true })
          .range(from, to),
      { label: "content_ir.kind_example" },
    ),
  ]);

  // Warm the registry from the same DB rows the app uses, so routing answers
  // match production rather than the compiled floor alone.
  await kindRegistry.ensureWarm();

  // The registries' own loaders build an ANON browser client internally, and
  // `anon` has no SELECT on content_ir.kind_component — headless, component
  // resolution would silently fall back to the compiled floor and every
  // DB-authored kind would be reported as having no live render. Feed the
  // resolver the rows through its own public ingest instead, using this
  // script's service-role client. A failure here is FATAL, not a warning:
  // a report that cannot see DB components is a report that lies.
  const componentRows = await readAllRows<{
    id: string;
    platform: string;
    role: string;
    component_key: string;
    source: string;
    is_active: boolean;
    config: Json;
    component_source: string | null;
    props_transform: string | null;
    pinned_kind_version: number | null;
    updated_at: string | null;
    created_at: string;
    created_by: string | null;
    kind_definition: { kind: string; deleted_at: string | null }[];
  }>(
    ({ from, to }) =>
      supabase
        .schema("content_ir")
        .from("kind_component")
        .select(
          "id,platform,role,component_key,source,is_active,config,component_source,props_transform,pinned_kind_version,updated_at,created_at,created_by,kind_definition!inner(kind,deleted_at)",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .is("kind_definition.deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "content_ir.kind_component" },
  );
  const resolverRows: KindComponentProjection[] = componentRows.flatMap((r) => {
    const definition = r.kind_definition[0];
    if (!definition?.kind) return [];
    if (!isJsonObject(r.config)) {
      throw new Error(
        `[stream] kind_component ${r.id} has a non-object config`,
      );
    }
    return [
      {
        kind: definition.kind,
        platform: r.platform,
        role: r.role,
        componentKey: r.component_key,
        source: r.source,
        isActive: r.is_active,
        config: r.config,
        componentSource: r.component_source,
        propsTransform: r.props_transform,
        pinnedKindVersion: r.pinned_kind_version,
        updatedAt: r.updated_at ?? r.created_at,
        createdAt: r.created_at,
        id: r.id,
        createdBy: r.created_by,
      },
    ];
  });
  componentRegistry.ingestDbRows(resolverRows);
  console.log(`[stream] resolver primed with ${componentRows.length} kind_component row(s)`);

  const canonicalByKindId = new Map<string, unknown>();
  for (const ex of examples) {
    if (ex.is_canonical) canonicalByKindId.set(ex.kind_definition_id, ex.data);
  }

  let candidates = kinds
    .filter((k) => !isContract(k.kind, k.metadata))
    .filter((k) => canonicalByKindId.has(k.id));
  if (kindArg) candidates = candidates.filter((k) => k.kind === kindArg);
  if (limitArg) candidates = candidates.slice(0, limitArg);
  candidates.sort((a, b) => a.kind.localeCompare(b.kind));

  const results: StreamCheckResult[] = [];
  for (const k of candidates) {
    try {
      results.push(
        checkKindStream(k.kind, canonicalByKindId.get(k.id), k.is_active),
      );
    } catch (err) {
      results.push({
        kind: k.kind,
        isActive: k.is_active,
        detectedWhileStreaming: false,
        kindResolvedWhileStreaming: false,
        noRawJsonFlash: false,
        completedAsKind: false,
        loaderShownFirst: false,
        realComponentWhileStreaming: false,
        loaderNeverReturns: false,
        growthSteps: 0,
        firstUnitChunk: null,
        totalChunks: 0,
        failures: [`threw: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  const active = results.filter((r) => r.isActive);
  const failing = active.filter((r) => r.failures.length > 0);
  const byFailure = new Map<string, string[]>();
  for (const r of failing) {
    for (const f of r.failures) {
      const list = byFailure.get(f) ?? [];
      list.push(r.kind);
      byFailure.set(f, list);
    }
  }

  writeFileSync(
    SNAPSHOT_PATH,
    `${JSON.stringify({ generatedFor: results.length, results }, null, 2)}\n`,
  );

  const lines: string[] = [
    "# Stream status — generated, never hand-maintained",
    "",
    "`pnpm check:shapes:stream` replays every kind's stored example through the",
    "REAL streaming pipeline (accumulator + kind route) and reports what a reader",
    "would see. Laws checked: detected while streaming · kind resolved live · no",
    "raw-JSON flash · completes as its kind · the real component renders live ·",
    "the loader never returns once it does.",
    "",
    `- kinds checked: **${results.length}** (active: ${active.length})`,
    `- ACTIVE kinds failing at least one law: **${failing.length}**`,
    "",
    "## Failures by law",
    "",
    "| law | active kinds failing | examples |",
    "| --- | --- | --- |",
  ];
  for (const [law, list] of [...byFailure.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`| \`${law}\` | ${list.length} | ${list.slice(0, 5).join(", ")} |`);
  }
  if (byFailure.size === 0) lines.push("| _(none)_ | 0 | |");
  lines.push("");
  writeFileSync(MARKDOWN_PATH, `${lines.join("\n")}\n`);

  console.log(`[stream] checked ${results.length} kinds (${active.length} active)`);
  for (const [law, list] of [...byFailure.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${law.padEnd(26)} ${String(list.length).padStart(4)}  e.g. ${list.slice(0, 4).join(", ")}`);
  }
  console.log(`[stream] report → ${MARKDOWN_PATH}`);

  if (strict && failing.length > 0) {
    console.error(`[stream] STRICT: ${failing.length} active kind(s) fail a streaming law`);
    process.exit(1);
  }
}

// Only run when invoked as a script (the checker itself is importable/testable).
if (process.argv[1] && process.argv[1].includes("check-stream")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
