#!/usr/bin/env tsx
/**
 * Shared Knowledge ACCEPTANCE MATRIX — `pnpm check:access-matrix`
 *
 * Parameterized, repeatable proof that a grant on a data store confers READ
 * on everything inside it — and nothing more. For (store, entitled_user,
 * control_user) it asserts the full grid at every level of the knowledge
 * tree: store row, members, file metadata + DB-level download check, doc
 * metadata, pages, page-image files, chunks (search), extraction
 * jobs/runs/results, and every files.* baby table — with
 * viewer=true / editor=false for the entitled user and all-false/0 for the
 * control user.
 *
 * Probes are REAL: kernel judges via service-key RPC, row visibility via a
 * real user JWT over PostgREST (true RLS). Loud, non-blocking (exit 0)
 * unless --strict. Wired like `pnpm check:schema`.
 *
 *   pnpm check:access-matrix
 *   pnpm check:access-matrix -- --store <uuid> --entitled <uuid> --control <uuid> --strict
 *
 * Defaults: AMA-G5 store + the grant-only entitled reader
 * (elliesadeghijd@gmail.com) + the non-entitled control. NEVER pass a
 * super-admin as the entitled user — it reports can_curate=true and masks
 * exactly the failures this matrix exists to catch (the script refuses).
 */

import process from "node:process";
import {
  C,
  baselineCount,
  loadEnv,
  mintUserJwt,
  rlsCount,
  rpc,
  type Env,
} from "./lib";

const DEFAULT_STORE = "0158e878-1bab-4c91-9597-da4e8951c2a7"; // AMA Guides 5th Ed
const DEFAULT_ENTITLED = "77c6af70-a35e-4724-a304-64a0dd789674"; // grant-only reader
const DEFAULT_CONTROL = "929274b1-a889-41ee-8a7f-dbaec7b0ee54"; // non-entitled
/** Known super-admins that must never be the entitled leg. */
const BANNED_ENTITLED = new Set(["87a6e699-3622-4869-8843-d0867456c0dd"]);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const STRICT = process.argv.includes("--strict");

interface Tree {
  store: { id: string; name: string; kind: string } | null;
  members: { source_kind: string; source_id: string }[];
  files: string[];
  docs: { id: string; archived: boolean }[];
  page_image_files: string[];
  extraction_jobs: string[];
  chunk_count: number;
}

interface Row {
  level: string;
  expect: string;
  got: string;
  ok: boolean;
}

const rows: Row[] = [];
function assert(level: string, expect: string, got: string, ok: boolean): void {
  rows.push({ level, expect, got, ok });
}

async function judge(env: Env, user: string, type: string, id: string, lvl: string): Promise<boolean> {
  return await rpc<boolean>(env, "has_access_as", {
    p_user: user,
    p_type: type,
    p_id: id,
    p_required: lvl,
  });
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.log(`${C.yellow}[WARN]${C.reset} access-matrix: Supabase creds absent — skipped.`);
    return 0;
  }
  const store = arg("store", DEFAULT_STORE);
  const entitled = arg("entitled", DEFAULT_ENTITLED);
  const control = arg("control", DEFAULT_CONTROL);

  if (BANNED_ENTITLED.has(entitled)) {
    console.error(
      `${C.red}[FAIL]${C.reset} entitled user ${entitled} is a super-admin — it reports can_curate=true and proves nothing. Use a grant-only identity.`,
    );
    return 1;
  }

  console.log(`${C.bold}Shared Knowledge acceptance matrix${C.reset}`);
  console.log(`${C.dim}store=${store} entitled=${entitled} control=${control}${C.reset}\n`);

  const tree = await rpc<Tree>(env, "access_matrix_tree", { p_store: store });
  if (!tree?.store) {
    console.error(`${C.red}[FAIL]${C.reset} store ${store} not found (access_matrix_tree returned no store).`);
    return 1;
  }

  const [jwtE, jwtC] = await Promise.all([mintUserJwt(env, entitled), mintUserJwt(env, control)]);

  // ── Store level ──────────────────────────────────────────────────────────
  assert("store judge viewer (entitled)", "true", String(await judge(env, entitled, "data_store", store, "viewer")), (await judge(env, entitled, "data_store", store, "viewer")) === true);
  assert("store judge editor (entitled)", "false", String(await judge(env, entitled, "data_store", store, "editor")), (await judge(env, entitled, "data_store", store, "editor")) === false);
  assert("store judge viewer (control)", "false", String(await judge(env, control, "data_store", store, "viewer")), (await judge(env, control, "data_store", store, "viewer")) === false);

  const storeRowsE = await rlsCount(env, jwtE, "rag", "data_stores", `id=eq.${store}`);
  const storeRowsC = await rlsCount(env, jwtC, "rag", "data_stores", `id=eq.${store}`);
  assert("store row RLS (entitled)", "1", String(storeRowsE), storeRowsE === 1);
  assert("store row RLS (control)", "0", String(storeRowsC), storeRowsC === 0);

  const memRowsE = await rlsCount(env, jwtE, "rag", "data_store_members", `data_store_id=eq.${store}&deleted_at=is.null`, "source_id");
  assert("members RLS (entitled)", `${tree.members.length}`, String(memRowsE), memRowsE === tree.members.length);
  const memRowsC = await rlsCount(env, jwtC, "rag", "data_store_members", `data_store_id=eq.${store}&deleted_at=is.null`, "source_id");
  assert("members RLS (control)", "0", String(memRowsC), memRowsC === 0);

  // ── File level ───────────────────────────────────────────────────────────
  for (const fileId of tree.files) {
    const short = fileId.slice(0, 8);
    assert(`file ${short} judge viewer (entitled) [DB download gate]`, "true", String(await judge(env, entitled, "file", fileId, "viewer")), (await judge(env, entitled, "file", fileId, "viewer")) === true);
    assert(`file ${short} judge editor (entitled)`, "false", String(await judge(env, entitled, "file", fileId, "editor")), (await judge(env, entitled, "file", fileId, "editor")) === false);
    assert(`file ${short} judge viewer (control)`, "false", String(await judge(env, control, "file", fileId, "viewer")), (await judge(env, control, "file", fileId, "viewer")) === false);

    const fE = await rlsCount(env, jwtE, "files", "files", `id=eq.${fileId}`);
    const fC = await rlsCount(env, jwtC, "files", "files", `id=eq.${fileId}`);
    assert(`file ${short} metadata RLS (entitled)`, "1", String(fE), fE === 1);
    assert(`file ${short} metadata RLS (control)`, "0", String(fC), fC === 0);

    // Baby tables — n/a when the baseline is empty for this file.
    const babies: [string, string, string][] = [
      ["files", "analysis", "file_id"],
      ["files", "analysis_result", "file_id"],
      ["files", "pages", "file_id"],
      ["files", "page_annotations", "file_id"],
      ["files", "entities", "file_id"],
      ["files", "file_rag_jobs", "file_id"],
    ];
    for (const [schema, table, col] of babies) {
      const base = await baselineCount(env, schema, table, `${col}=eq.${fileId}`);
      if (base <= 0) {
        assert(`${schema}.${table} for ${short}`, "n/a (no rows)", `baseline=${base}`, true);
        continue;
      }
      const e = await rlsCount(env, jwtE, schema, table, `${col}=eq.${fileId}`);
      const c = await rlsCount(env, jwtC, schema, table, `${col}=eq.${fileId}`);
      assert(`${schema}.${table} for ${short} RLS (entitled)`, `${base}`, String(e), e === base);
      assert(`${schema}.${table} for ${short} RLS (control)`, "0", String(c), c === 0);
    }
  }

  // ── Document level ───────────────────────────────────────────────────────
  for (const doc of tree.docs) {
    const short = doc.id.slice(0, 8);
    const readE = await rpc<boolean>(env, "can_read_processed_document", { p_doc: doc.id, p_user: entitled });
    const curateE = await rpc<boolean>(env, "can_curate_library_document", { p_doc: doc.id, p_user: entitled });
    const readC = await rpc<boolean>(env, "can_read_processed_document", { p_doc: doc.id, p_user: control });
    // Archived docs: grant readers must LOSE read (D-D rule).
    assert(`doc ${short} can_read (entitled)`, doc.archived ? "false (archived)" : "true", String(readE), readE === !doc.archived);
    assert(`doc ${short} can_curate (entitled)`, "false", String(curateE), curateE === false);
    assert(`doc ${short} can_read (control)`, "false", String(readC), readC === false);

    if (!doc.archived) {
      const dE = await rlsCount(env, jwtE, "docproc", "processed_documents", `id=eq.${doc.id}`);
      const dC = await rlsCount(env, jwtC, "docproc", "processed_documents", `id=eq.${doc.id}`);
      assert(`doc ${short} metadata RLS (entitled)`, "1", String(dE), dE === 1);
      assert(`doc ${short} metadata RLS (control)`, "0", String(dC), dC === 0);

      const pBase = await baselineCount(env, "docproc", "processed_document_pages", `processed_document_id=eq.${doc.id}`);
      const pE = await rlsCount(env, jwtE, "docproc", "processed_document_pages", `processed_document_id=eq.${doc.id}`);
      const pC = await rlsCount(env, jwtC, "docproc", "processed_document_pages", `processed_document_id=eq.${doc.id}`);
      assert(`doc ${short} pages RLS (entitled)`, `${pBase}`, String(pE), pE === pBase);
      assert(`doc ${short} pages RLS (control)`, "0", String(pC), pC === 0);
    }
  }

  // ── Page-image files ─────────────────────────────────────────────────────
  for (const img of tree.page_image_files) {
    const ok = await judge(env, entitled, "file", img, "viewer");
    const okC = await judge(env, control, "file", img, "viewer");
    assert(`page image ${img.slice(0, 8)} judge viewer (entitled)`, "true", String(ok), ok === true);
    assert(`page image ${img.slice(0, 8)} judge viewer (control)`, "false", String(okC), okC === false);
  }

  // ── Chunks (search-hit level) ────────────────────────────────────────────
  // Probe one specific chunk id: a whole-corpus filter as the CONTROL user
  // statement-times-out (per-row SECURITY DEFINER policy evaluation over
  // thousands of rows — recorded perf finding), which would be indistinguishable
  // from denial. A single-id probe is fast and decisive for both users.
  if (tree.chunk_count > 0 && tree.files.length > 0) {
    const anyFile = tree.files[0];
    const cE = await rlsCount(env, jwtE, "rag", "kg_chunks", `source_kind=eq.cld_file&source_id=eq.${anyFile}`);
    assert("chunks RLS >0 (entitled) [search hit]", ">0", String(cE), cE > 0);
    const oneChunk = await fetch(
      `${env.url}/rest/v1/kg_chunks?select=id&source_kind=eq.cld_file&source_id=eq.${anyFile}&limit=1`,
      { headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}`, "Accept-Profile": "rag" } },
    ).then((r) => r.json() as Promise<{ id: string }[]>);
    if (oneChunk[0]?.id) {
      const cC = await rlsCount(env, jwtC, "rag", "kg_chunks", `id=eq.${oneChunk[0].id}`);
      assert("chunk row RLS (control)", "0", String(cC), cC === 0);
    }
  }

  // ── Extraction jobs + children ───────────────────────────────────────────
  for (const jobId of tree.extraction_jobs) {
    const short = jobId.slice(0, 8);
    const jE = await rlsCount(env, jwtE, "docproc", "page_extraction_jobs", `id=eq.${jobId}`);
    const jC = await rlsCount(env, jwtC, "docproc", "page_extraction_jobs", `id=eq.${jobId}`);
    assert(`extraction job ${short} RLS (entitled)`, "1", String(jE), jE === 1);
    assert(`extraction job ${short} RLS (control)`, "0", String(jC), jC === 0);

    for (const child of ["page_extraction_runs", "page_extraction_results"]) {
      const base = await baselineCount(env, "docproc", child, `job_id=eq.${jobId}`);
      if (base <= 0) {
        assert(`${child} for ${short}`, "n/a (no rows)", `baseline=${base}`, true);
        continue;
      }
      const e = await rlsCount(env, jwtE, "docproc", child, `job_id=eq.${jobId}`);
      const c = await rlsCount(env, jwtC, "docproc", child, `job_id=eq.${jobId}`);
      assert(`${child} for ${short} RLS (entitled)`, `${base}`, String(e), e === base);
      assert(`${child} for ${short} RLS (control)`, "0", String(c), c === 0);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  let failures = 0;
  for (const r of rows) {
    if (r.ok) {
      console.log(`  ${C.green}PASS${C.reset} ${r.level} ${C.dim}(${r.got})${C.reset}`);
    } else {
      failures += 1;
      console.log(`  ${C.red}FAIL${C.reset} ${C.bold}${r.level}${C.reset} expected ${r.expect}, got ${r.got}`);
    }
  }
  console.log("");
  if (failures > 0) {
    console.error(
      `${C.red}${C.bold}ACCESS MATRIX: ${failures}/${rows.length} probes FAILED.${C.reset} The cascade is broken somewhere above — fix before shipping. (Loud, non-blocking; --strict exits 1.)`,
    );
    return STRICT ? 1 : 0;
  }
  console.log(`${C.green}${C.bold}ACCESS MATRIX GREEN${C.reset} — ${rows.length} probes passed.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${C.red}[FAIL]${C.reset} access-matrix crashed: ${String(err)}`);
    process.exit(STRICT ? 1 : 0);
  });
