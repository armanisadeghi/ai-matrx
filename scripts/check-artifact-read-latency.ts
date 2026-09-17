#!/usr/bin/env npx tsx
/**
 * THE CODING-SESSION FILES TAB MUST OPEN EVERY TIME (CS-27)
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
 * WHAT THIS GUARD DOES. Two detectors, both must pass.
 *
 * 1. STATIC — the query this guard replays is still the query the app ships.
 *    `service.ts` must still filter `metadata->>kind` and
 *    `metadata->>cli_session_id` and order by `metadata->>relative_path`. If a
 *    lane changes the shape, the guard says so instead of silently measuring a
 *    read nobody makes any more (and the index in
 *    `migrations/files_coding_session_artifact_lookup_index.sql` needs re-aiming
 *    with it).
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
 * `--self-test` proves the detector can go RED against the same live database by
 * replaying the read with an even wider shape (`metadata->>kind` matched by
 * `like` instead of `eq`) and asserting it is measurably worse — slower, or
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
 * the read needs a leakproof, indexed predicate — a real column, or an
 * RLS-bypassing lookup that hands the outer, RLS-applied select a list of ids.
 * That choice is a platform read-path decision, not a patch; it is escalated,
 * and this guard stays red until it lands.
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
    ['.eq("metadata->>kind"', "the kind equality"],
    ['.eq("metadata->>cli_session_id"', "the session equality"],
    ['.order("metadata->>relative_path"', "the relative-path sort"],
  ];
  for (const [needle, what] of required) {
    if (!src.includes(needle)) {
      problems.push(
        `${SERVICE_FILE} no longer carries ${what} (${needle}), so this guard would measure a ` +
          `request the panel does not send. Re-aim the guard AND ` +
          `migrations/files_coding_session_artifact_lookup_index.sql at the new shape.`,
      );
    }
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
    "metadata->>kind": "eq.coding_session_artifact",
    "metadata->>cli_session_id": `eq.${cliSessionId}`,
    deleted_at: "is.null",
    order: "metadata->>relative_path.asc",
  });
  return `files?${qs.toString()}`;
}

/**
 * THE SHAPE THE INDEX CANNOT ANSWER, replayed only by `--self-test`: `like` on
 * `metadata->>kind` instead of `eq` cannot be an index condition, so the planner
 * is back to the full walk plus per-row RLS that produced the original 500s.
 */
function unindexableRequest(cliSessionId: string): string {
  const qs = new URLSearchParams({
    select: filesColumns(),
    "metadata->>kind": "like.coding_session_artifac%",
    "metadata->>cli_session_id": `eq.${cliSessionId}`,
    deleted_at: "is.null",
    order: "metadata->>relative_path.asc",
  });
  return `files?${qs.toString()}`;
}

/**
 * How many artifact rows of this session the signed-in identity can actually
 * see. `rows: null` means the COUNT ITSELF failed — which is not a missing
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
    "metadata->>kind": "eq.coding_session_artifact",
    "metadata->>cli_session_id": `eq.${sid}`,
    deleted_at: "is.null",
  });
  const t0 = Date.now();
  const res = await fetch(`${c.url}/rest/v1/files?${qs.toString()}`, {
    method: "HEAD",
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${token}`,
      "Accept-Profile": "files",
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const ms = Date.now() - t0;
  const total = res.headers.get("content-range")?.split("/")[1];
  if (res.status >= 300 && res.status !== 206) return { rows: null, status: res.status, ms };
  return { rows: total && total !== "*" ? Number(total) : null, status: res.status, ms };
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
    `${TAG.ok}${SERVICE_FILE} still sends the two JSONB equalities and the relative-path sort this guard measures.`,
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

  const attempts: Attempt[] = [];
  for (let i = 0; i < runs; i += 1) {
    attempts.push(await get(creds, token, "files", panelRequest(target.sid)));
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
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${TAG.fail}UNMEASURED — guard crashed: ${String(err)}`);
    process.exit(2);
  });
