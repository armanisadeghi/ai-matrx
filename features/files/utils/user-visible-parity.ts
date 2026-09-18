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
 *      `files.is_user_visible_path` / `public.is_system_path` functions.
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
 * There is no "skip when unconfigured": a missing credential is a FAILURE with
 * the remedy, never a silent pass.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

import {
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
];

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
    metadata: Record<string, unknown> | null;
  }> = [];
  const ROW_PAGE = 1000;
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .schema("files")
      .from("files")
      .select("id, file_path, parent_file_id, derivation_kind, metadata")
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

  let mismatches = 0;
  for (const path of corpus) {
    const { data: sqlFile, error: e1 } = await filesSchema.rpc(
      "is_user_visible_path",
      { p_file_path: path },
    );
    if (e1) fail(`files.is_user_visible_path('${path}') failed: ${e1.message}`);
    const { data: sqlSystem, error: e2 } = await supabase.rpc("is_system_path", {
      p_path: path,
    });
    if (e2) fail(`public.is_system_path('${path}') failed: ${e2.message}`);

    const tsFile = isUserVisibleFilePath(path);
    const tsFolder = isUserVisibleFolderPath(path);
    if (tsFile !== sqlFile) {
      console.error(
        `  file rule mismatch on ${JSON.stringify(path)}: TS=${tsFile} SQL=${sqlFile}`,
      );
      mismatches += 1;
    }
    if (tsFolder !== !sqlSystem) {
      console.error(
        `  folder rule mismatch on ${JSON.stringify(path)}: TS=${tsFolder} SQL=${!sqlSystem}`,
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

  const predicate = new Set<string>();
  const verdictByPath = new Map<string, boolean>();
  for (const row of rows) {
    const path = row.file_path;
    if (typeof path !== "string") continue;
    if (row.parent_file_id !== null || row.derivation_kind !== null) continue;
    // The RPC's SECOND conjunct: `NOT files.is_crawl_artifact(id)`. Its
    // metadata branch is readable from here; its web.snapshot / web.screenshot
    // branches are not (those tables are not exposed to the browser), so a row
    // excluded only by those still fails below, loudly and by id.
    if (isCrawlArtifactByMetadata(row.metadata)) continue;
    let verdict = verdictByPath.get(path);
    if (verdict === undefined) {
      const { data, error } = await filesSchema.rpc("is_user_visible_path", {
        p_file_path: path,
      });
      if (error) fail(`is_user_visible_path failed: ${error.message}`);
      verdict = Boolean(data);
      verdictByPath.set(path, verdict);
    }
    if (verdict) predicate.add(row.id);
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
