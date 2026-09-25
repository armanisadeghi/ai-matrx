/**
 * features/files/utils/user-visible-parity.ts
 *
 * THE PARITY GUARD for the one visibility rule (folder-sync SPEC-SERVER §1.4,
 * §10.1). Run it live:
 *
 *   pnpm tsx features/files/utils/user-visible-parity.ts
 *
 * It signs in as the shared test admin (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD
 * from .env.local — values are never printed) and proves two things that the
 * browser and the sync daemon must agree on:
 *
 *   A. MIRROR PARITY — every path in the corpus below, plus every distinct
 *      top-level prefix that actually exists in this account, gets the SAME
 *      answer from `features/files/utils/user-visible.ts` as from the live
 *      `files.is_user_visible_path` / `files.is_user_visible_folder_path` /
 *      `files.is_recent_activity_path` functions.
 *
 *   B. RENDERED-SET PARITY — the set of file ids the BROWSER renders equals
 *      the set the predicate admits. The browser's rendered set is what
 *      survives the real pipeline: `get_user_file_tree` (which applies the
 *      predicate server-side) and then the client filters in
 *      `features/files/redux/thunks.ts` and
 *      `features/files/components/surfaces/desktop/row-data.ts` — which are
 *      now NONE, by design. The predicate's set is computed by asking the
 *      DATABASE for the verdict on every candidate row's path (never by
 *      re-deciding in TypeScript, which would make the test circular).
 *
 * 🚨 SET-BASED, because the first version was not. It asked
 * `files.is_user_visible_path` once PER DISTINCT PATH — 18,710 rows on the
 * heaviest owner — and a verification seat killed it three times without ever
 * reaching part B's verdict (2026-09-21). An unfinishable guard is an
 * unmeasured guard. Both halves now go through
 * `files.is_user_visible_paths(text[])`, one round trip per batch.
 *
 * Knobs (limits are knobs — `common-docs/policies/limits-are-knobs-agents-set-them.md`):
 *   PARITY_PATH_BATCH   paths per round trip. Default 2000.
 *   PARITY_MAX_PATHS    0 (default) = the whole corpus. Above zero, the run is
 *                       BOUNDED to that many distinct paths and BOTH sides are
 *                       scoped to the rows carrying them; the report says so,
 *                       so a sampled run can never read as a full one.
 *
 * There is no "skip when unconfigured": a missing credential is a FAILURE with
 * the remedy, never a silent pass.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { formatDurationMs } from "@ai-matrx/kit/format";

import {
  isRecentActivityPath,
  isUserVisibleFilePath,
  isUserVisibleFolderPath,
} from "./user-visible";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/** Edge cases the rule has to get right, independent of what the account holds. */
const PATH_CORPUS = [
  "My Files/report.pdf",
  "My Files/nested/deep/a.txt",
  "system-files",
  "system-files/fastfire/sessions/a.wav",
  "generations",
  "generations/img.png",
  ".matrx-tmp",
  ".matrx-tmp/upload.part",
  "FastFire",
  "FastFire/sessions/clip.wav",
  "FastFire/responses/answer.wav",
  "coding-sessions/abc/log.jsonl",
  "tool-images/1/v/thumb.jpg",
  "pdf-extractions/x.txt",
  "Transcripts/Recordings/old.m4a",
  "/leading-slash.txt",
  "//double//slash.txt",
  "system-files-not-really/a.txt",
  ".matrx-tmpish/a.txt",
  "Inbox/note.md",
  "/coding-sessions/x.md",
  "My Files/coding-sessions/x.md",
  "Images/Generated/cat.png",
  "Images/Generated",
  "Images/GeneratedX/cat.png",
  "Generated/a.png",
  "Agent Apps/blocks/b.png",
  "Images/agent-blocks/c.png",
  "/Transcripts/Recordings/x.m4a",
  "FastFire/responses/r.wav",
];

/** Paths per round trip. A knob, not a constant (limits are knobs). */
const PATH_BATCH = Math.max(
  1,
  Number(process.env.PARITY_PATH_BATCH ?? "2000") || 2000,
);

/** 0 = the whole corpus. Above zero the run is BOUNDED and says so. */
const MAX_PATHS = Math.max(0, Number(process.env.PARITY_MAX_PATHS ?? "0") || 0);

/** The readable branch of `files.is_crawl_artifact` — the metadata marker. */
function isCrawlArtifactByMetadata(
  metadata: Record<string, unknown> | null,
): boolean {
  if (!metadata) return false;
  return (
    metadata["system_artifact"] === true &&
    metadata["artifact_domain"] === "web_crawl"
  );
}

function fail(message: string): never {
  console.error(`\nFAIL — ${message}\n`);
  process.exit(1);
}

/**
 * Every path's verdict in one round trip per batch, from the DATABASE.
 * `files.is_user_visible_paths(text[])` is the set-based form of the scalar
 * predicate (pure, IMMUTABLE, same body) — added 2026-09-21 precisely so this
 * guard can finish.
 */
async function verdicts(
  filesSchema: ReturnType<ReturnType<typeof createClient>["schema"]>,
  paths: string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (let i = 0; i < paths.length; i += PATH_BATCH) {
    const batch = paths.slice(i, i + PATH_BATCH);
    const { data, error } = await filesSchema.rpc("is_user_visible_paths", {
      p_paths: batch,
    });
    if (error)
      fail(
        `files.is_user_visible_paths failed on a batch of ${batch.length}: ${error.message}`,
      );
    // The RPC answers with a jsonb path->boolean OBJECT, not a row set:
    // PostgREST caps a set-returning RPC at db-max-rows (1000) and would drop
    // the rest of the batch without an error — an unmeasured guard wearing a
    // measured one's output. Measured 2026-09-21 before the return type
    // changed: a 2000-path batch came back with 1000 verdicts.
    const verdictsInBatch = (data ?? {}) as Record<string, boolean>;
    for (const [path, visible] of Object.entries(verdictsInBatch))
      out.set(path, Boolean(visible));
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.AI_ADMIN_USERNAME;
  const password = process.env.AI_ADMIN_PASSWORD;
  if (!url || !key)
    fail(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set — this guard cannot run, and an unrun guard is not a pass. Add them to .env.local.",
    );
  if (!email || !password)
    fail(
      "AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are not set — sign-in is required to compare the rendered set against the predicate. Add them to .env.local.",
    );

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user)
    fail(`sign-in failed: ${authError?.message ?? "no user returned"}`);
  const userId = auth.user.id;
  console.log(`Signed in as ${auth.user.email} (${userId})`);

  // ---------------------------------------------------------------------
  // A. Mirror parity — TypeScript vs the live SQL functions.
  // ---------------------------------------------------------------------
  const filesSchema = supabase.schema("files");

  // PostgREST caps a bare select at 1000 rows — a capped read here would make
  // the comparison confidently wrong, so page explicitly to exhaustion.
  const rows: Array<{
    id: string;
    file_path: string | null;
    parent_file_id: string | null;
    derivation_kind: string | null;
    artifact_kind: string | null;
    metadata: Record<string, unknown> | null;
  }> = [];
  const ROW_PAGE = 1000;
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .schema("files")
      .from("files")
      .select(
        "id, file_path, parent_file_id, derivation_kind, artifact_kind, metadata",
      )
      .eq("created_by", userId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + ROW_PAGE - 1);
    if (error) fail(`reading files.files failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < ROW_PAGE) break;
  }
  console.log(`Read ${rows.length} alive owned file rows.`);

  const livePaths = new Set<string>();
  for (const row of rows) {
    const path = row.file_path;
    if (typeof path === "string" && path.length > 0) {
      const head = path.replace(/^\/+/, "").split("/")[0] ?? "";
      livePaths.add(`${head}/__parity_probe.txt`);
      livePaths.add(head);
    }
  }
  const corpus = Array.from(new Set([...PATH_CORPUS, ...livePaths])).sort();

  // ONE round trip per batch for the file rule — never one per path.
  const corpusVerdicts = await verdicts(filesSchema, corpus);

  let mismatches = 0;
  for (const path of corpus) {
    const sqlFile = corpusVerdicts.get(path);
    if (sqlFile === undefined)
      fail(
        `files.is_user_visible_paths returned no verdict for ${JSON.stringify(path)} — the batch RPC dropped a path, which would silently shrink this comparison.`,
      );
    const { data: sqlFolder, error: e2 } = await filesSchema.rpc(
      "is_user_visible_folder_path",
      { p_folder_path: path },
    );
    if (e2)
      fail(`files.is_user_visible_folder_path('${path}') failed: ${e2.message}`);
    const { data: sqlRecent, error: e3 } = await filesSchema.rpc(
      "is_recent_activity_path",
      { p_file_path: path },
    );
    if (e3)
      fail(`files.is_recent_activity_path('${path}') failed: ${e3.message}`);

    const tsFile = isUserVisibleFilePath(path);
    const tsFolder = isUserVisibleFolderPath(path);
    const tsRecent = isRecentActivityPath(path);
    if (tsFile !== sqlFile) {
      console.error(
        `  file rule mismatch on ${JSON.stringify(path)}: TS=${tsFile} SQL=${sqlFile}`,
      );
      mismatches += 1;
    }
    if (tsFolder !== Boolean(sqlFolder)) {
      console.error(
        `  folder rule mismatch on ${JSON.stringify(path)}: TS=${tsFolder} SQL=${Boolean(sqlFolder)}`,
      );
      mismatches += 1;
    }
    if (tsRecent !== Boolean(sqlRecent)) {
      console.error(
        `  recents rule mismatch on ${JSON.stringify(path)}: TS=${tsRecent} SQL=${Boolean(sqlRecent)}`,
      );
      mismatches += 1;
    }
  }
  if (mismatches > 0)
    fail(
      `${mismatches} mirror mismatch(es) over ${corpus.length} paths. The database changed the rule and features/files/utils/user-visible.ts did not.`,
    );
  console.log(`A. Mirror parity: OK over ${corpus.length} paths.`);

  // ---------------------------------------------------------------------
  // B. Rendered-set parity — the browser's set vs the predicate's set.
  // ---------------------------------------------------------------------
  const rendered = new Set<string>();
  const PAGE = 5000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.rpc("get_user_file_tree", {
      p_user_id: userId,
      p_limit: PAGE,
      p_offset: offset,
      p_include_folders: false,
      p_include_deleted: false,
      p_order_by: "name",
    });
    if (error) fail(`get_user_file_tree failed: ${error.message}`);
    const page = (data ?? []) as Array<{
      kind: string;
      id: string;
      created_by: string;
    }>;
    // Shared-in files reach the tree through iam.permissions, not through the
    // owner path this guard compares; scope both sides to rows this user owns.
    for (const row of page)
      if (row.kind === "file" && row.created_by === userId) rendered.add(row.id);
    if (page.length < PAGE) break;
  }
  // The client pipeline applies NO further visibility filter (that is the
  // point of this cutover), so the rendered set is the RPC's set.

  const candidates = rows.filter((row) => {
    if (typeof row.file_path !== "string") return false;
    if (
      row.parent_file_id !== null ||
      row.derivation_kind !== null ||
      row.artifact_kind !== null
    )
      return false;
    // The RPC's SECOND conjunct: `NOT files.is_crawl_artifact(id)`. Its
    // metadata branch is readable from here; its web.snapshot / web.screenshot
    // branches are not (those tables are not exposed to the browser), so a row
    // excluded only by those still fails below, loudly and by id.
    return !isCrawlArtifactByMetadata(row.metadata);
  });
  let distinctPaths = [
    ...new Set(candidates.map((row) => row.file_path as string)),
  ].sort();
  const bounded = MAX_PATHS > 0 && distinctPaths.length > MAX_PATHS;
  if (bounded) distinctPaths = distinctPaths.slice(0, MAX_PATHS);
  const inScope = new Set(distinctPaths);
  const started = Date.now();
  const verdictByPath = await verdicts(filesSchema, distinctPaths);
  console.log(
    `B. ${distinctPaths.length} distinct path(s) judged by the database in ${formatDurationMs(Date.now() - started, { style: "compact" })} (batch ${PATH_BATCH})${
      bounded
        ? ` — BOUNDED RUN: PARITY_MAX_PATHS=${MAX_PATHS}, this is a SAMPLE, not the whole corpus`
        : ""
    }.`,
  );

  const predicate = new Set<string>();

  for (const row of candidates) {
    const path = row.file_path as string;
    if (!inScope.has(path)) continue;

    const verdict = verdictByPath.get(path);
    if (verdict === undefined)
      fail(
        `no verdict came back for ${JSON.stringify(path)} — the batch RPC dropped a path.`,
      );
    if (verdict) predicate.add(row.id);
  }
  // A bounded run compares like with like: the rendered side is scoped to the
  // same rows, so a sample can never look like a disagreement. A rendered id
  // this account does not own a row for is NEVER dropped — that is an anomaly,
  // not an out-of-sample row.
  if (bounded) {
    const ownedPathById = new Map(
      rows.map((row) => [row.id, row.file_path] as const),
    );
    for (const id of [...rendered]) {
      const path = ownedPathById.get(id);
      if (typeof path === "string" && !inScope.has(path)) rendered.delete(id);
    }
  }

  // The RPC carries ONE conjunct this guard cannot evaluate: `files.is_crawl_artifact`
  // (a provenance test, not a visibility shape — SPEC-SERVER §1.2 S2). It is
  // not granted to `authenticated`, so it cannot be waved through silently:
  // a row the predicate admits and the tree withholds is reported as a
  // failure naming the row, and the operator checks whether it is a crawl
  // artifact. Live count of crawl artifacts on the heaviest owner: 0.
  const onlyInPredicate = [...predicate].filter((id) => !rendered.has(id));
  const onlyInRendered = [...rendered].filter((id) => !predicate.has(id));
  for (const id of onlyInPredicate)
    console.error(
      `  predicate admits ${id} but the tree withholds it — not explained by the crawl-artifact metadata marker. If it is a crawl artifact recorded only in web.snapshot/web.screenshot, the browser cannot see that; the row needs the marker or the guard needs a door.`,
    );
  for (const id of onlyInRendered)
    console.error(`  browser renders ${id} but the predicate rejects it`);

  console.log(
    `B. Rendered ${rendered.size} · predicate ${predicate.size}`,
  );
  if (onlyInPredicate.length > 0 || onlyInRendered.length > 0)
    fail(
      `rendered-set parity broken: ${onlyInPredicate.length} row(s) the predicate admits are not rendered, ${onlyInRendered.length} row(s) rendered that the predicate rejects.`,
    );

  console.log("\nPASS — the browser's rendered set equals the predicate's set.");
  await supabase.auth.signOut({ scope: "local" });
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
