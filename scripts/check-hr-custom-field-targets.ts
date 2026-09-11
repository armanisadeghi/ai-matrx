#!/usr/bin/env npx tsx
/**
 * HR CUSTOM-FIELD ENABLEMENT — DOES THE SETTINGS PAGE SHOW WHAT THE DATABASE
 * ACTUALLY ENABLES? (DD-097)
 *
 * THE FAILURE THIS EXISTS FOR, observed live on 2026-09-11 against
 * `db.matrxserver.com`:
 *
 *   `features/hr/settings/service.ts` asked `platform.custom_field_target` about a
 *   HAND-WRITTEN list of seven `hr_*` tokens, filtered to the active employer's
 *   `organization_id`. Live, `custom_field_target` holds FIVE rows — `hr_candidate`,
 *   `hr_employee`, `hr_position_assignment`, `hr_requisition`,
 *   `hr_training_assignment` — every one `is_enabled = true`, every one owned by the
 *   Matrx System org at `visibility = 'public'`, i.e. a PLATFORM DEFAULT every
 *   employer inherits. Only two of the five were on the list, and the org filter
 *   excluded all five anyway. The query returned ZERO rows for a real employer and
 *   `HrFieldsPanel` printed "No HR record type has custom fields switched on yet" —
 *   a false sentence, in an admin surface, about a governance setting.
 *
 * TWO DETECTORS, both of which must pass.
 *
 * 1. STATIC — no hand-written `hr_*` token list may come back into the two files.
 *    A list in code is the defect itself: it goes stale the moment a token is
 *    enabled in the database, and nothing tells anyone.
 *
 * 2. LIVE — signs in as the real test admin and runs, as that identity through
 *    PostgREST, the EXACT filter the page runs, for a REAL employer org read from
 *    that user's own memberships. Every `hr_*` target row that identity is allowed
 *    to see and that is switched on MUST come back in the page's scope. This is not
 *    a mock: the rows, the RLS, the JWT and the filter are the shipped ones.
 *
 * `--self-test` proves the live detector RED by running the OLD query shape (the
 * seven hardcoded tokens + `organization_id = <employer>`) against the same live
 * database and asserting it is MISSING rows the new one returns. A guard nobody has
 * seen fail is not a guard.
 *
 * CREDENTIALS ABSENT = UNMEASURED = FAILURE, never a warn that reads as a pass
 * (the repo rule that `check:kind-types` and `check:realtime-publication` follow).
 * Exit 0 pass · 1 fail · 2 unmeasured.
 *
 *   pnpm check:hr-custom-field-targets
 *   pnpm check:hr-custom-field-targets:self-test
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

/** The files that must never carry a hand-written token list again. */
const GUARDED_FILES = [
  "features/hr/settings/service.ts",
  "features/hr/settings/fields/HrFieldsPanel.tsx",
];

/** The pattern the page must use, kept in ONE place and asserted to still be there. */
const REQUIRED_LIKE = 'HR_CUSTOM_FIELD_TOKEN_LIKE = "hr\\\\_%"';

/** The old, wrong list — named so the self-test can replay it live. */
const RETIRED_TOKENS = [
  "hr_employee",
  "hr_employment",
  "hr_position_assignment",
  "hr_location",
  "hr_department",
  "hr_job_title",
  "hr_incident",
];

// ── Detector 1: static ──────────────────────────────────────────────────────

function staticDetector(): string[] {
  const problems: string[] = [];

  for (const rel of GUARDED_FILES) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) {
      problems.push(`${rel} is missing — the guard cannot see the surface it guards.`);
      continue;
    }
    const src = readFileSync(p, "utf8");

    // Comments explain the history on purpose and must stay readable, so only code
    // lines are examined.
    const code = src
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
      })
      .join("\n");

    // A LIST is two or more `hr_*` literals sitting next to each other — an array,
    // an `in (...)`, a lookup map. One `hr_*` literal on its own is an error code or
    // a single named token and is nobody's staleness risk.
    const adjacency = /["'`]hr_[a-z_]+["'`]\s*[,:]\s*\n?\s*["'`]?hr_[a-z_]+["'`]/;
    if (adjacency.test(code)) {
      const sample = code.match(adjacency)?.[0]?.replace(/\s+/g, " ") ?? "";
      problems.push(
        `${rel} carries a hand-written hr_* token list (…${sample}…). ` +
          `The enablement rows are READ by prefix; a list in code is the DD-097 defect returning.`,
      );
    }

    // And the page must never go back to asking about named tokens.
    for (const call of ['.in("target_token"', ".in('target_token'"]) {
      if (code.includes(call)) {
        problems.push(
          `${rel} filters target_token with ${call}…) — an explicit token list by another name.`,
        );
      }
    }
  }

  const serviceSrc = readFileSync(resolve(ROOT, GUARDED_FILES[0]), "utf8");
  if (!serviceSrc.includes(REQUIRED_LIKE)) {
    problems.push(
      `features/hr/settings/service.ts no longer declares ${REQUIRED_LIKE} — the prefix read is gone.`,
    );
  }
  if (!serviceSrc.includes("visibility.eq.public")) {
    problems.push(
      `features/hr/settings/service.ts no longer widens the target scope to the public platform defaults, ` +
        `so an employer with no rows of its own will again be told nothing is switched on.`,
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

async function rest<T>(
  c: Creds,
  token: string,
  schema: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${token}`,
      "Accept-Profile": schema,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

interface TargetRow {
  id: string;
  organization_id: string | null;
  target_token: string;
  is_enabled: boolean;
  visibility?: string;
}

/** `hr\_%` — the backslash escapes LIKE's single-char wildcard; `%` is `%25` in a URL. */
const LIKE = "like.hr%5C_%25";

/** THE PAGE'S QUERY, byte for byte what `fetchHrCustomFieldRegistry` sends. */
function pageScopeQuery(orgId: string): string {
  return (
    `custom_field_target?select=id,organization_id,target_token,is_enabled` +
    `&or=(organization_id.eq.${orgId},visibility.eq.public)` +
    `&target_token=${LIKE}&deleted_at=is.null&order=target_token`
  );
}

/** THE RETIRED QUERY, replayed only by --self-test to show the guard going red. */
function retiredQuery(orgId: string): string {
  return (
    `custom_field_target?select=id,organization_id,target_token,is_enabled` +
    `&organization_id=eq.${orgId}&target_token=in.(${RETIRED_TOKENS.join(",")})` +
    `&deleted_at=is.null&order=target_token`
  );
}

/** Everything this identity may see at all — the truth the page is measured against. */
function everythingVisibleQuery(): string {
  return (
    `custom_field_target?select=id,organization_id,target_token,is_enabled,visibility` +
    `&target_token=${LIKE}&deleted_at=is.null&order=target_token`
  );
}

async function main(): Promise<number> {
  const selfTest = process.argv.includes("--self-test");

  const staticProblems = staticDetector();
  if (staticProblems.length > 0) {
    for (const p of staticProblems) console.error(`${TAG.fail}${p}`);
    return 1;
  }
  console.log(`${TAG.ok}No hand-written hr_* token list; the prefix read is declared.`);

  const creds = loadCreds();
  if (!creds) {
    console.error(
      `${TAG.fail}UNMEASURED — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ` +
        `AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD are needed to ask the live database what it enables. ` +
        `This is not a pass.`,
    );
    return 2;
  }

  let token: string;
  let userId: string;
  try {
    ({ token, userId } = await signIn(creds));
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — could not sign in: ${String(err)}`);
    return 2;
  }

  let visible: TargetRow[];
  try {
    visible = await rest<TargetRow[]>(creds, token, "platform", everythingVisibleQuery());
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — registry read failed: ${String(err)}`);
    return 2;
  }

  // A REAL employer org, read from this user's own memberships — and deliberately
  // one that owns NO enablement row of its own, because that is the case the page
  // got wrong: an ordinary employer inheriting the platform defaults.
  const orgsOwningRows = new Set(
    visible.map((r) => r.organization_id).filter((v): v is string => Boolean(v)),
  );
  let orgId: string;
  try {
    const memberships = await rest<{ organization_id: string }[]>(
      creds,
      token,
      "iam",
      `organization_member?select=organization_id&user_id=eq.${userId}&limit=200`,
    );
    const plainEmployer = memberships
      .map((m) => m.organization_id)
      .find((id) => !orgsOwningRows.has(id));
    if (!plainEmployer) {
      console.error(
        `${TAG.fail}UNMEASURED — ${creds.email} belongs to no organization that inherits the platform ` +
          `defaults rather than owning its own rows, so the case this guard exists for cannot be tested.`,
      );
      return 2;
    }
    orgId = plainEmployer;
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — membership read failed: ${String(err)}`);
    return 2;
  }
  console.log(
    `${TAG.info}Employer under test: ${orgId} — a real membership of ${creds.email} that owns no enablement row of its own.`,
  );

  let shown: TargetRow[];
  try {
    shown = await rest<TargetRow[]>(creds, token, "platform", pageScopeQuery(orgId));
  } catch (err) {
    console.error(`${TAG.fail}UNMEASURED — page-scope read failed: ${String(err)}`);
    return 2;
  }

  const shownTokens = new Set(shown.map((r) => r.target_token));
  // What the page OUGHT to show: every switched-on row inside its declared scope —
  // this employer's own rows, plus the public platform defaults. A row belonging to
  // some OTHER employer that a platform admin happens to be able to read is
  // deliberately not the page's business, and is excluded here too.
  const oughtToShow = visible.filter(
    (r) =>
      r.is_enabled &&
      (r.organization_id === orgId || r.visibility === "public"),
  );
  const missing = oughtToShow.filter((r) => !shownTokens.has(r.target_token));

  console.log(
    `${TAG.info}Live: ${visible.length} hr_* enablement rows visible, ${oughtToShow.length} switched on, ` +
      `${shown.length} in the page's scope → ${[...shownTokens].join(", ") || "(none)"}`,
  );

  if (missing.length > 0) {
    console.error(
      `${TAG.fail}The HR Fields page hides ${missing.length} record type(s) the database has switched on: ` +
        `${missing.map((r) => r.target_token).join(", ")}. An admin is being told they are not enabled.`,
    );
    return 1;
  }
  if (oughtToShow.length === 0) {
    console.error(
      `${TAG.fail}UNMEASURED — no hr_* enablement row is switched on live, so this check proved nothing. ` +
        `Five were switched on on 2026-09-11; if that changed, say so deliberately.`,
    );
    return 2;
  }
  console.log(
    `${TAG.ok}All ${oughtToShow.length} enabled HR record types reach the page.`,
  );

  if (selfTest) {
    let retired: TargetRow[];
    try {
      retired = await rest<TargetRow[]>(creds, token, "platform", retiredQuery(orgId));
    } catch (err) {
      console.error(`${TAG.fail}self-test — replay of the retired query failed: ${String(err)}`);
      return 1;
    }
    const retiredTokens = new Set(retired.map((r) => r.target_token));
    const hiddenByOldShape = oughtToShow.filter((r) => !retiredTokens.has(r.target_token));
    if (hiddenByOldShape.length === 0) {
      console.error(
        `${TAG.fail}self-test — the RETIRED query shape (seven hardcoded tokens, employer-only) returned ` +
          `everything the fixed one does, so this detector cannot be shown failing and proves nothing today.`,
      );
      return 1;
    }
    console.log(
      `${TAG.ok}self-test RED proven: the retired query shape returns ${retired.length} row(s) and hides ` +
        `${hiddenByOldShape.length} enabled record type(s) — ${hiddenByOldShape.map((r) => r.target_token).join(", ")}.`,
    );
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${TAG.fail}${String(err)}`);
    process.exit(1);
  });
