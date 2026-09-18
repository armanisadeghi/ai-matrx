#!/usr/bin/env npx tsx
/**
 * THE CODING-SESSION FILES TAB MUST OPEN EVERY TIME, AND SHOW EVERYTHING (CS-27/CS-30)
 *
 * THE FAILURE THIS EXISTS FOR, measured live on 2026-09-17 against
 * `db.matrxserver.com` as the test admin:
 *
 *   `features/ai-work/conversations/artifacts/service.ts` is the Files tab's ONLY
 *   read. It asks `files.files` for one coding session's artifacts by two JSONB
 *   equalities and sorts on a third JSONB path. Nothing indexed any of them, so
 *   the planner walked all ~158k live rows of a hot 335 MB table and ran the
 *   `std_select` RLS predicate — a ~180-subplan OR chain — on every one before
 *   the two equalities could discard it. EXPLAIN ANALYZE: 29,147 ms. Through
 *   PostgREST the same read took 5.3-8.3 s against role `authenticated`'s 8 s
 *   `statement_timeout`, so which side of the ceiling a click landed on was
 *   cache weather: twenty consecutive identical GETs returned 15 × 200 and
 *   5 × HTTP 500 `57014 canceling statement due to statement timeout`. A person
 *   opening a conversation's Files tab met "We couldn't load this session's
 *   artifacts / Try again" about one open in four.
 *
 * THE FIX THAT LANDED (CS-30, same day). The identity the client filters by
 * moved into two REAL COLUMNS that the server's upload door stamps from the
 * upload's metadata — `files.files.artifact_kind` and
 * `files.files.provider_session_id` — because `texteq` on a text column IS
 * leakproof and a btree on it becomes an Index Cond under the same RLS policy.
 * Measured after, same identity, same session:
 *   Index Cond on `files_artifact_provider_session_idx`, 6,614 candidate rows
 *   instead of 161,861 · 0.1 ms for a session whose rows the reader owns ·
 *   0.9 ms for a session with none.
 * WHAT REMAINS, and it is NOT this read's shape: the `files.files` RLS
 * predicate itself costs 2.5-6 s of setup (several `iam.accessible_entity_ids`
 * sets, ~670k buffers) the moment ONE examined row is not the reader's own —
 * measured for both a platform admin and an ordinary user. So a session holding
 * another account's artifacts still reads slowly no matter how good the plan
 * is. That is the access system's generated predicate, escalated separately;
 * this guard measures it rather than hiding it.
 *
 * WHAT THIS GUARD DOES. Four detectors, all must pass.
 *
 * 1. STATIC — the query this guard replays is still the query the app ships.
 *    `service.ts` must still filter the two REAL COLUMNS, order by
 *    `metadata->>relative_path`, and read EVERY page. If a lane
 *    changes the shape, the guard says so instead of silently measuring a read
 *    nobody makes any more (and `files_artifact_provider_session_idx`, added by
 *    `migrations/20260917_files_artifact_identity_backfill_and_index.sql`, needs
 *    re-aiming with it). A `metadata->>` filter coming BACK is refused by name:
 *    that is the defect, not a style choice.
 *
 * 2. LIVE — signs in as the real test admin and sends, as that identity through
 *    PostgREST with `Accept-Profile: files`, the EXACT request the panel sends,
 *    N times (default 20) against the HEAVIEST session that identity can see.
 *    Every single one must return 200. Nothing is mocked: the rows, the RLS, the
 *    JWT, the column list, the filters and the sort are the shipped ones, and a
 *    500 here is the exact 500 a person gets.
 *
 * It asserts 20/20, not an average, because the defect was never that the read
 * was slow on average — it was that it sat ON the ceiling. The p-max latency it
 * prints is the headroom number to watch: if it climbs back toward 8 s, fix the
 * plan again, never the ceiling.
 *
 * 3. COMPLETE — the panel builds a file tree and COUNTS files, so a truncated
 *    list is a lie about what a session produced. PostgREST caps a bare
 *    `.select()` at 1,000 rows with HTTP 206 and no error, and the biggest live
 *    session holds 6,614 artifact rows. So this detector sends the panel's
 *    request twice: once unpaged (the request the panel used to send) and once
 *    paged with `Range`, the way it sends it now. Under the cap the two must
 *    agree; at the cap the unpaged one must stop there while the paged one goes
 *    past it. It takes no exact count, for the reason `pageHeaders` documents,
 *    and a single disagreement is re-read before it fails — a live session can
 *    change between two requests.
 *
 * `--self-test` proves the detector can go RED against the same live database by
 * replaying THE PRE-FIX SHAPE — the two `metadata->>` equalities, the ones no
 * index can serve under RLS — and asserting it is measurably worse: slower, or
 * outright timing out. A guard nobody has seen fail is not a guard. It has also
 * been seen failing for real: 0 ok / 20 failed, 8,191 ms min, on 2026-09-17
 * before anything was changed.
 *
 * WHY THIS CANNOT BE FIXED WITH AN INDEX ON THE JSONB PATHS — do not try again.
 * `files.files` has RLS enabled, and PostgreSQL may not evaluate a qual whose
 * operator is not LEAKPROOF before the security quals, so such a qual can never
 * become an index condition. `jsonb_object_field_text` (`->>`) is not leakproof
 * (`pg_proc.proleakproof = false`). Measured on the same statement and the same
 * identity: as `postgres`, with RLS off, the expression index
 * `files_coding_session_artifact_idx` is chosen, both equalities become Index
 * Cond, 2.4 ms. As `authenticated`, with RLS on, that index is ignored, the
 * planner walks `idx_cld_files_owner` in full and both equalities are demoted
 * into Filter: cost 3,986,650, 29,147 ms. The control: the same read with a
 * LEAKPROOF qual (`uuid_eq` on `created_by`, or a text range on `file_path`)
 * DOES get an Index Cond under the identical policy and returns in 1.1 ms. So
 * the read needs a leakproof, indexed predicate — which is what CS-30 gave it:
 * `artifact_kind` and `provider_session_id`, real text columns stamped by the
 * server's upload door and indexed by
 * `files_artifact_provider_session_idx`.
 *
 * CREDENTIALS ABSENT = UNMEASURED = FAILURE, never a warn that reads as a pass
 * (the rule `check:kind-types` and `check:realtime-publication` follow).
 * Exit 0 pass · 1 fail · 2 unmeasured.
 *
 * Usage:
 *   pnpm check:artifact-read-latency
 *   pnpm check:artifact-read-latency -- --runs 30 --session <provider_session_id>
 *   pnpm check:artifact-read-latency:self-test
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(import.meta.dirname, "..");

const TAG = {
  ok: "[32mPASS[0m  ",
  fail: "[31mFAIL[0m  ",
  info: "[36mINFO[0m  ",
};

/** The `authenticated` role's ceiling. The budget, not a thing to raise. */
const STATEMENT_TIMEOUT_MS = 8_000;

/** Headroom we insist on: a read that needs more than this is back on the edge. */
const HEADROOM_CEILING_MS = 4_000;

/** Matrx Main's PostgREST `db-max-rows`. A bare `.select()` stops here, silently. */
const POSTGREST_MAX_ROWS = 1_000;

const SERVICE_FILE = "features/ai-work/conversations/artifacts/service.ts";

/**
 * The ONE legal projection for `files.files` — kept in step with
 * `FILES_TABLE_COLUMNS` in `features/files/filesDb.ts`, which the static
 * detector re-reads rather than trusting this copy.
 */
function filesColumns(): string {
  const src = readFileSync(resolve(ROOT, "features/files/filesDb.ts"), "utf8");
  const m = src.match(/export const FILES_TABLE_COLUMNS\s*=\s*\n?\s*"([^"]+)"/);
  if (!m) throw new Error("could not read FILES_TABLE_COLUMNS from features/files/filesDb.ts");
  return m[1].replace(/\s+/g, "");
}

// ── Detector 1: the shape under test is the shape that ships ────────────────

function staticDetector(): string[] {
  const problems: string[] = [];
  const p = resolve(ROOT, SERVICE_FILE);
  if (!existsSync(p)) {
    problems.push(`${SERVICE_FILE} is gone — this guard is aimed at a read that no longer exists.`);
    return problems;
  }
  const src = readFileSync(p, "utf8");
  const required: [string, string][] = [
    ['.eq("artifact_kind"', "the kind equality on the real column"],
    ['.eq("provider_session_id"', "the session equality on the real column"],
    ['.order("metadata->>relative_path"', "the relative-path sort"],
    ["readAllRows", "the complete (paged) read"],
  ];
  for (const [needle, what] of required) {
    if (!src.includes(needle)) {
      problems.push(
        `${SERVICE_FILE} no longer carries ${what} (${needle}), so this guard would measure a ` +
          `request the panel does not send. Re-aim the guard AND ` +
          `migrations/20260917_files_artifact_identity_backfill_and_index.sql at the new shape.`,
      );
    }
  }
  // THE DEFECT COMING BACK, refused by name. A `metadata->>` FILTER on this
  // read cannot be an index condition under RLS — ever — so its return is the
  // 500s returning, not a style regression. (The `order` on a JSONB path is
  // fine and is required above: only quals must be leakproof.)
  for (const m of src.matchAll(/\.(eq|neq|like|ilike|in|gt|lt|gte|lte)\(\s*"metadata->>/g)) {
    problems.push(
      `${SERVICE_FILE} filters this read by a JSONB path again (\`.${m[1]}("metadata->>…\`). ` +
        `\`jsonb_object_field_text\` is not LEAKPROOF, so under \`files.files\`'s RLS that qual ` +
        `can never become an index condition and the planner walks the whole table — the exact ` +
        `defect that made the Files tab 500 (CS-27). Filter the real columns \`artifact_kind\` / ` +
        `\`provider_session_id\` instead.`,
    );
  }
  return problems;
}

// ── Live plumbing ───────────────────────────────────────────────────────────

interface Creds {
  url: string;
  key: string;
  email: string;
  password: string;
}

function loadCreds(): Creds | null {
  const want = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "AI_ADMIN_USERNAME",
    "AI_ADMIN_PASSWORD",
  ];
  const env: Record<string, string> = {};
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  for (const f of [".env.local", ".env"]) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      if (want.includes(k) && !env[k]) env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
    }
  }
  if (want.some((k) => !env[k])) return null;
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    email: env.AI_ADMIN_USERNAME,
    password: env.AI_ADMIN_PASSWORD,
  };
}

async function signIn(c: Creds): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: c.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (!res.ok) throw new Error(`sign-in failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
  if (!body.access_token || !body.user?.id) throw new Error("sign-in returned no session");
  return { token: body.access_token, userId: body.user.id };
}

interface Attempt {
  status: number;
  ms: number;
  body: string;
}

async function get(
  c: Creds,
  token: string,
  schema: string,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<Attempt> {
  const t0 = Date.now();
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${token}`,
      "Accept-Profile": schema,
      ...extraHeaders,
    },
  });
  const body = await res.text();
  return { status: res.status, ms: Date.now() - t0, body };
}

/**
 * THE PANEL'S REQUEST, byte for byte what `artifactsQuery` sends: the same
 * column list, the same two JSONB equalities, the same soft-delete filter and
 * the same JSONB sort, under `Accept-Profile: files`.
 */
function panelRequest(cliSessionId: string): string {
  const qs = new URLSearchParams({
    select: filesColumns(),
    artifact_kind: "eq.coding_session_artifact",
    provider_session_id: `eq.${cliSessionId}`,
    deleted_at: "is.null",
    order: "metadata->>relative_path.asc,id.asc",
  });
  return `files?${qs.toString()}`;
}

/**
 * THE SHAPE NO INDEX CAN ANSWER, replayed only by `--self-test`: the pre-fix
 * request, filtering the two `metadata->>` paths. `jsonb_object_field_text` is
 * not LEAKPROOF, so under this table's RLS those quals can never be index
 * conditions and the planner is back to the full walk plus per-row policy that
 * produced the original 500s.
 */
function unindexableRequest(cliSessionId: string): string {
  const qs = new URLSearchParams({
    select: filesColumns(),
    "metadata->>kind": "eq.coding_session_artifact",
    "metadata->>cli_session_id": `eq.${cliSessionId}`,
    deleted_at: "is.null",
    order: "metadata->>relative_path.asc",
  });
  return `files?${qs.toString()}`;
}

/**
 * How many artifact rows of this session the signed-in identity can actually
 * see, up to one page (the number the heaviest-session choice compares). `rows: null` means the COUNT ITSELF failed — which is not a missing
 * measurement but the defect showing up in the discovery step, so a session
 * whose count cannot be taken is exactly the session worth measuring.
 */
async function visibleCount(
  c: Creds,
  token: string,
  sid: string,
): Promise<{ rows: number | null; status: number; ms: number }> {
  const qs = new URLSearchParams({
    select: "id",
    artifact_kind: "eq.coding_session_artifact",
    provider_session_id: `eq.${sid}`,
    deleted_at: "is.null",
  });
  // ONE page of ids, no `count=exact`: an exact count is a second statement and
  // pays this table's RLS predicate twice, which is enough to put the discovery
  // step itself over the 8 s ceiling (it did — HTTP 500 after 8,133 ms while the
  // panel's own read was returning 200 in 5 s). A discovery step that fails on
  // the thing it is measuring teaches nothing, so it asks the cheap question:
  // how many rows are there, up to a page.
  const t0 = Date.now();
  const res = await fetch(`${c.url}/rest/v1/files?${qs.toString()}`, {
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${token}`,
      "Accept-Profile": "files",
      Range: `0-${POSTGREST_MAX_ROWS - 1}`,
      "Range-Unit": "items",
    },
  });
  const ms = Date.now() - t0;
  if (res.status >= 300 && res.status !== 206) return { rows: null, status: res.status, ms };
  return { rows: (JSON.parse(await res.text()) as unknown[]).length, status: res.status, ms };
}

/**
 * The worst case a person can actually open — never a convenient small session.
 * Candidates come from `chat.coding_session`, the rows the panel is reached
 * through, newest first. A session whose own COUNT cannot be taken wins
 * immediately: that read is already over the ceiling. Otherwise the one with
 * the most rows this identity may read.
 */
async function heaviestSession(
  c: Creds,
  token: string,
  explicit: string | null,
): Promise<{ sid: string; rows: number | null; why: string } | null> {
  if (explicit) {
    const c0 = await visibleCount(c, token, explicit);
    return { sid: explicit, rows: c0.rows, why: "named with --session" };
  }

  const listed = await get(
    c,
    token,
    "chat",
    "coding_session?select=provider_session_id&deleted_at=is.null&order=created_at.desc&limit=40",
  );
  if (listed.status !== 200) return null;
  const ids = (JSON.parse(listed.body) as { provider_session_id: string | null }[])
    .map((r) => r.provider_session_id)
    .filter((v): v is string => Boolean(v));
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;

  // The newest sessions are often empty of artifacts for this identity (a
  // session row exists the moment a coding session is mirrored; the publisher
  // may have uploaded nothing, or nothing this identity may read). A guard that
  // reports UNMEASURED on an ordinary day is no guard, so the candidate list
  // also comes from the artifact rows THEMSELVES — the panel's own table, by
  // the panel's own indexed columns, which is a cheap read now that those are
  // real columns.
  const fromRows = await get(
    c,
    token,
    "files",
    `files?select=provider_session_id&artifact_kind=eq.coding_session_artifact&deleted_at=is.null&order=provider_session_id.asc&limit=1000`,
  );
  if (fromRows.status < 300) {
    const tally = new Map<string, number>();
    for (const r of JSON.parse(fromRows.body) as { provider_session_id: string | null }[]) {
      if (r.provider_session_id) {
        tally.set(r.provider_session_id, (tally.get(r.provider_session_id) ?? 0) + 1);
      }
    }
    for (const sid of [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([sid]) => sid)) {
      if (!unique.includes(sid)) unique.push(sid);
    }
  }

  let best: { sid: string; rows: number | null; why: string } | null = null;
  for (const sid of unique) {
    const { rows, status, ms } = await visibleCount(c, token, sid);
    if (rows === null) {
      return {
        sid,
        rows: null,
        why:
          `its own row COUNT failed with HTTP ${status} after ${ms} ms — the discovery step ` +
          `already met the failure this guard measures`,
      };
    }
    if (rows > 0 && (!best || (best.rows ?? -1) < rows)) {
      best = { sid, rows, why: "the most artifact rows this identity may read" };
    }
  }
  return best;
}

/**
 * The headers the panel sends for ONE page: the row window, and NOTHING ELSE.
 *
 * No `Prefer: count=exact`, deliberately, and this is measured rather than
 * assumed: PostgREST computes an exact count as its own statement, so it pays
 * the `files.files` RLS predicate a second time. Twenty requests each against
 * the heaviest session, as the test admin:
 *   with    count=exact — 0 ok / 20 HTTP 500, 8,119 ms min (the 8 s ceiling)
 *   without             — 20 ok / 0 failed, 4,787-5,141 ms
 * So `service.ts` proves completeness with a SHORT PAGE instead of a count, and
 * this guard sends what it sends.
 */
function pageHeaders(c: Creds, token: string, from: number, to: number): Record<string, string> {
  return {
    apikey: c.key,
    Authorization: `Bearer ${token}`,
    "Accept-Profile": "files",
    Range: `${from}-${to}`,
    "Range-Unit": "items",
  };
}

/**
 * The panel's request, PAGED the way `readAllRows` pages it: `Range` headers of
 * `POSTGREST_MAX_ROWS` rows until the server's own total is collected. Returns
 * what a complete read really costs — rows and round trips.
 */
async function pagedRowCount(
  c: Creds,
  token: string,
  sid: string,
): Promise<{ rows: number; requests: number; total: number | null }> {
  let rows = 0;
  let requests = 0;
  let total: number | null = null;
  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const to = from + POSTGREST_MAX_ROWS - 1;
    const res = await fetch(`${c.url}/rest/v1/${panelRequest(sid)}`, {
      headers: { ...pageHeaders(c, token, from, to) },
    });
    requests += 1;
    if (res.status >= 300 && res.status !== 206) {
      throw new Error(
        `paged read failed at rows ${from}-${to}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`,
      );
    }
    if (total === null) {
      const declared = res.headers.get("content-range")?.split("/")[1];
      total = declared && declared !== "*" ? Number(declared) : null;
    }
    const page = JSON.parse(await res.text()) as unknown[];
    rows += page.length;
    if (page.length < POSTGREST_MAX_ROWS) return { rows, requests, total };
    if (requests > 100) throw new Error("paged read did not terminate within 100 requests");
  }
}

function summarize(attempts: Attempt[]): {
  ok: number;
  failed: number;
  min: number;
  max: number;
  firstFailure: Attempt | undefined;
} {
  const ok = attempts.filter((a) => a.status >= 200 && a.status < 300).length;
  return {
    ok,
    failed: attempts.length - ok,
    min: Math.min(...attempts.map((a) => a.ms)),
    max: Math.max(...attempts.map((a) => a.ms)),
    firstFailure: attempts.find((a) => a.status < 200 || a.status >= 300),
  };
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : null;
}

async function main(): Promise<number> {
  const selfTest = process.argv.includes("--self-test");
  const runs = Number(argValue("--runs") ?? (selfTest ? 6 : 20));

  const staticProblems = staticDetector();
  if (staticProblems.length > 0) {
    for (const p of staticProblems) console.error(`${TAG.fail}${p}`);
    return 1;
  }
  console.log(
    `${TAG.ok}${SERVICE_FILE} still filters the two real columns, sorts by the relative path, and ` +
      `reads every page — the request this guard measures.`,
  );

  const creds = loadCreds();
  if (!creds) {
    console.error(
      `${TAG.fail}UNMEASURED — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ` +
        `AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD are needed to send the panel's own read to the ` +
        `live database. This is not a pass.`,
    );
    return 2;
  }

  let token: string;
  try {
    ({ token } = await signIn(creds));
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — could not sign in: ${String(err)}`);
    return 2;
  }
  console.log(`${TAG.info}Signed in as ${creds.email} against ${creds.url}.`);

  let target: { sid: string; rows: number | null; why: string } | null;
  try {
    target = await heaviestSession(creds, token, argValue("--session"));
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — could not choose a session to measure: ${String(err)}`);
    return 2;
  }
  if (!target) {
    console.error(
      `${TAG.fail}UNMEASURED — ${creds.email} can see no coding session with artifact rows, so the ` +
        `read this guard exists for cannot be sent.`,
    );
    return 2;
  }
  console.log(
    `${TAG.info}Session under test: ${target.sid} — chosen because ${target.why} ` +
      `(${target.rows ?? "count unavailable"} artifact rows it may read).`,
  );

  // The panel's FIRST page, sent exactly as `readAllRows` sends it: the row
  // window plus the exact count it verifies completeness against.
  const firstPage = async (): Promise<Attempt> => {
    const t0 = Date.now();
    const res = await fetch(`${creds.url}/rest/v1/${panelRequest(target!.sid)}`, {
      headers: pageHeaders(creds, token, 0, POSTGREST_MAX_ROWS - 1),
    });
    const body = await res.text();
    return { status: res.status === 206 ? 200 : res.status, ms: Date.now() - t0, body };
  };

  const attempts: Attempt[] = [];
  for (let i = 0; i < runs; i += 1) {
    attempts.push(await firstPage());
  }
  const s = summarize(attempts);
  console.log(
    `${TAG.info}The panel's own request ×${runs}: ${s.ok} ok / ${s.failed} failed · ` +
      `${s.min} ms min · ${s.max} ms max (ceiling ${STATEMENT_TIMEOUT_MS} ms).`,
  );

  if (selfTest) {
    const worse: Attempt[] = [];
    for (let i = 0; i < runs; i += 1) {
      worse.push(await get(creds, token, "files", unindexableRequest(target.sid)));
    }
    const w = summarize(worse);
    console.log(
      `${TAG.info}The un-indexable shape ×${runs} (self-test): ${w.ok} ok / ${w.failed} failed · ` +
        `${w.min} ms min · ${w.max} ms max.`,
    );
    const wentRed = w.failed > 0 || w.max > s.max * 3;
    if (!wentRed) {
      console.error(
        `${TAG.fail}SELF-TEST DID NOT GO RED — the shape the index cannot answer ` +
          `(${w.ok}/${runs} ok, ${w.max} ms max) was neither failing nor markedly worse than the ` +
          `indexed shape (${s.max} ms max). Either something else is now carrying this read, or ` +
          `this guard can no longer tell the two apart. Do not trust its green until it can.`,
      );
      return 1;
    }
    console.log(
      `${TAG.ok}Self-test: the un-indexable shape is demonstrably worse (${w.failed} failures, ` +
        `${w.max} ms max vs ${s.max} ms), so a green above is a measurement and not an accident.`,
    );
  }

  if (s.failed > 0) {
    console.error(
      `${TAG.fail}THE FILES TAB DOES NOT OPEN EVERY TIME — ${s.failed} of ${runs} identical reads ` +
        `failed as ${creds.email} on the live database. First failure: HTTP ` +
        `${s.firstFailure?.status} after ${s.firstFailure?.ms} ms — ` +
        `${s.firstFailure?.body.slice(0, 200)}. A person opening this session's Files tab sees ` +
        `"We couldn't load this session's artifacts" that often. Fix the PLAN, never the ` +
        `statement timeout — and NOT with an expression index on the JSONB paths: that was ` +
        `tried and cannot work (see the WHY THIS CANNOT BE FIXED WITH AN INDEX note in this ` +
        `file's header). The read needs a LEAKPROOF, indexed predicate.`,
    );
    return 1;
  }

  if (s.max > HEADROOM_CEILING_MS) {
    console.error(
      `${TAG.fail}NO HEADROOM LEFT — every read returned 200, but the slowest took ${s.max} ms of ` +
        `the ${STATEMENT_TIMEOUT_MS} ms ceiling (watch line: ${HEADROOM_CEILING_MS} ms). This read ` +
        `failed one open in four the last time it sat this close. Fix the plan before it crosses.`,
    );
    return 1;
  }

  console.log(
    `${TAG.ok}${runs}/${runs} of the panel's own reads returned 200 as ${creds.email} on the live ` +
      `database, slowest ${s.max} ms of a ${STATEMENT_TIMEOUT_MS} ms ceiling.`,
  );

  // ── Detector 4: no artifact row is INVISIBLE to the panel ────────────────
  //
  // The panel now finds rows by `artifact_kind` / `provider_session_id`, so a
  // coding-session artifact whose columns were never stamped is not "slow" —
  // it is GONE from its session, silently. Two ways that happens: a window
  // between the backfill and the upload door's deploy, and a future writer that
  // sets the metadata without the columns.
  //
  // The detector asks for rows under the artifact path prefix that CLAIM the
  // kind in their metadata and carry no `artifact_kind`. The prefix does the
  // narrowing — `file_path=like.coding-sessions/%` is a text range, leakproof,
  // so it rides an index under RLS — and the JSONB equality then filters a set
  // already down to dozens of rows, which is why this probe is not itself the
  // slow shape the header warns about. It is deliberately NOT a bare
  // `artifact_kind is null` under the prefix: rows that carry no `kind` at all
  // (six from 2026-09-14) were never listed by this panel under either shape,
  // and a guard that is permanently red for a pre-existing gap teaches nothing.
  // Its view is this identity's rows only (RLS), so it is a canary, not a
  // census: it cannot see another account's unstamped rows.
  const orphanQs = new URLSearchParams({
    select: "id,file_path",
    file_path: "like.coding-sessions/%",
    artifact_kind: "is.null",
    "metadata->>kind": "eq.coding_session_artifact",
    deleted_at: "is.null",
    limit: "5",
  });
  const orphans = await get(creds, token, "files", `files?${orphanQs.toString()}`);
  if (orphans.status >= 300) {
    console.error(
      `${TAG.fail}UNMEASURED — could not check for unstamped artifact rows ` +
        `(HTTP ${orphans.status}).`,
    );
    return 2;
  }
  const orphanRows = JSON.parse(orphans.body) as { file_path: string }[];
  if (orphanRows.length > 0) {
    console.error(
      `${TAG.fail}ARTIFACT ROWS ARE INVISIBLE TO THE PANEL — ${orphanRows.length}+ row(s) under ` +
        `coding-sessions/ carry no \`artifact_kind\`, so no session lists them however fast the ` +
        `read is. First: ${orphanRows[0]?.file_path}. Either aidream's upload door ` +
        `(matrx_files/artifact_identity.py) is not stamping the columns on this path, or rows ` +
        `landed between the backfill and that door's deploy. Re-stamp them: UPDATE files.files ` +
        `SET artifact_kind = metadata->>'kind', provider_session_id = metadata->>'cli_session_id' ` +
        `WHERE metadata->>'kind' = 'coding_session_artifact' AND artifact_kind IS NULL.`,
    );
    return 1;
  }
  console.log(
    `${TAG.ok}No artifact row of this identity is missing its identity columns, so nothing is ` +
      `invisible to the panel.`,
  );

  // ── Detector 3: the list the panel treats as COMPLETE is complete ─────────
  //
  // No count is taken (see `pageHeaders`), so completeness is proven the way
  // `service.ts` proves it: page until a page comes back short. The assertion
  // that makes it a guard rather than a print-out is the comparison with ONE
  // unpaged request — the request the panel used to send. Under the cap the two
  // must agree exactly; at the cap the unpaged one must stop there while the
  // paged one goes past it.
  const unpaged = await get(creds, token, "files", panelRequest(target.sid));
  if (unpaged.status >= 300) {
    console.error(
      `${TAG.fail}UNMEASURED — the unpaged control request failed (HTTP ${unpaged.status}), so ` +
        `completeness cannot be compared against it.`,
    );
    return 2;
  }
  const unpagedRows = (JSON.parse(unpaged.body) as unknown[]).length;
  let paged: { rows: number; requests: number };
  try {
    paged = await pagedRowCount(creds, token, target.sid);
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — the paged read could not complete: ${String(err)}`);
    return 2;
  }
  console.log(
    `${TAG.info}Completeness: one unpaged request returned ${unpagedRows} row(s); the paged read ` +
      `collected ${paged.rows} in ${paged.requests} request(s) (PostgREST caps a page at ` +
      `${POSTGREST_MAX_ROWS}).`,
  );
  if (unpagedRows >= POSTGREST_MAX_ROWS) {
    if (paged.rows <= unpagedRows) {
      console.error(
        `${TAG.fail}THE PANEL WOULD COUNT THE WRONG NUMBER OF FILES — one request stopped at the ` +
          `${POSTGREST_MAX_ROWS}-row cap and the paged read collected no more than that ` +
          `(${paged.rows}). A file tree and a file count built on a capped list is a confident ` +
          `lie about what a coding session produced, and the paging is not clearing the cap.`,
      );
      return 1;
    }
    console.log(
      `${TAG.ok}The cap is live and the paging clears it: one request stopped at ` +
        `${unpagedRows} rows, the paged read returned ${paged.rows}.`,
    );
    return 0;
  }
  if (paged.rows !== unpagedRows) {
    // A session can genuinely change between two requests (the publisher is
    // still uploading; a sweep soft-deletes a row). That is churn, not a paging
    // bug, so the disagreement must REPEAT to count: both legs are re-read back
    // to back and only a second disagreement fails.
    const second = await get(creds, token, "files", panelRequest(target.sid));
    const secondUnpaged =
      second.status < 300 ? (JSON.parse(second.body) as unknown[]).length : -1;
    const secondPaged = await pagedRowCount(creds, token, target.sid);
    if (secondPaged.rows === secondUnpaged) {
      console.log(
        `${TAG.ok}The paged read agrees with the plain read on re-read ` +
          `(${secondPaged.rows} rows); the first pair disagreed (${paged.rows} vs ` +
          `${unpagedRows}) because the session changed between the two requests.`,
      );
      return 0;
    }
    console.error(
      `${TAG.fail}THE PAGED READ AND THE PLAIN READ DISAGREE TWICE — ${paged.rows} vs ` +
        `${unpagedRows}, then ${secondPaged.rows} vs ${secondUnpaged} — ` +
        `rows for the same session, both under the ${POSTGREST_MAX_ROWS}-row cap. One of them is ` +
        `wrong about what this session holds; a paged read with an unstable order can repeat and ` +
        `skip rows across a page boundary.`,
    );
    return 1;
  }
  console.log(
    `${TAG.ok}The paged read agrees with the plain read (${paged.rows} rows). ` +
      `NOTE: this session is under the ${POSTGREST_MAX_ROWS}-row cap, so the cap-CLEARING leg is ` +
      `not exercised here — name a session over the cap with --session to exercise it.`,
  );
  return 0;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(`${TAG.fail}UNMEASURED — guard crashed: ${String(err)}`);
    exitAfterDrain(2);
  });
