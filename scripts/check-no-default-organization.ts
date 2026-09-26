/**
 * check-no-default-organization — NOTHING BUT THE PICKER MAY CHOOSE AN ORGANIZATION.
 *
 * THE RULING (Arman, 2026-09-19)
 * ------------------------------
 * A "default organization" is at most a PER-CLIENT DISPLAY PREFERENCE. Nothing
 * but the org picker and pure UI display may read it. No data read, no write,
 * no API route, no server action, no transport and no boot ladder may PICK an
 * organization for the person — not from a cookie, not from a saved preference,
 * not from their personal org. Sole-membership auto-select is fine; that is the
 * one case where there is nothing to choose.
 *
 *   "one missed org check that should have just failed turns into 50 in a month
 *    and 5,000 in a year, and suddenly we don't have orgs any more, we have a
 *    user and a default org, which means we just have user now."
 *
 * THE FAILURE CLASS
 * -----------------
 * Every instance of this class looks locally reasonable and is globally fatal:
 * a resolver quietly reads `user_preferences.organization.defaultOrganizationId`
 * and calls it the answer; a server helper substitutes `current_personal_org_id()`
 * when the caller passed nothing; a feature hook imports the picker's selector to
 * "pre-fill" a new record's org; a route handler reaches for client Redux. None
 * of them refuses. Each one files a person's work into an organization they never
 * chose, and does it SILENTLY (law 4) — the row is in the wrong tenant and the
 * screen says it worked. The correct behaviour when the organization is unknown
 * is to FAIL, loudly, with the picker — never to guess.
 *
 * The three seat-proven instances this guard was built failing against, on the
 * unmodified tree of 2026-09-19:
 *   - `lib/organizations/resolveActiveOrgContext.ts` — `readDefaultOrgIdFromDb`
 *     selecting `defaultOrganizationId` out of `users.user_preferences` as a
 *     rung of the boot ladder;
 *   - `lib/organizations/personalOrg.ts` — `ensureOrgIdServer` /
 *     `resolveOrgIdForUserServer` calling `current_personal_org_id` /
 *     `ensure_personal_organization` outside `resolvePersonalOrgId`;
 *   - `features/notes/hooks/useNewNoteOrganization.ts` — importing
 *     `selectDefaultOrganizationId` to choose a new note's organization.
 *
 * THE FIVE RULES
 * --------------
 *  1. DB DEFAULT-ORG READS. Reading the stored default-organization preference
 *     in order to choose an org — a query that plucks `defaultOrganizationId`
 *     out of `user_preferences`, or a function NAMED like `readDefaultOrgIdFromDb`
 *     — is allowed ONLY inside `features/organizations/**` (the picker) and
 *     `features/settings/**` (where the person states the preference).
 *  2. THE PERSONAL-ORG RPC. `current_personal_org_id` (and its provisioning twin
 *     `ensure_personal_organization`) may be CALLED or NAMED IN CODE only inside
 *     `lib/organizations/personalOrg.ts`, and there only inside
 *     `resolvePersonalOrgId` — plus guard scripts and tests, which this guard
 *     does not scan. Anywhere else it is a SUBSTITUTION: the server answering
 *     "which organization?" with "their personal one" because nobody asked.
 *  3. `selectDefaultOrganizationId` CONSUMERS. The picker's selector may be read
 *     only from `features/organizations/**` and `features/settings/**`. Any other
 *     consumer is a feature choosing an organization out of a display preference.
 *  4. `useAppSelector` UNDER `app/api/**`. A route handler reading client Redux is
 *     nonsense on its face — the store does not exist there — and in practice it is
 *     a smuggled default: the org the browser happened to be showing, asserted
 *     server-side. Any `useAppSelector` under `app/api/**` fails.
 *  5. "DEFAULT ORGANIZATION" IN USER-FACING ERROR COPY. The phrase inside a string
 *     that reaches a person — a toast, `user_message` / `userMessage`, a `title:`
 *     or `description:`, a thrown `Error(...)` — teaches the person that a default
 *     organization is a thing the system acts on. It is not. Say which organization
 *     is required and offer the picker. COMMENTS AND DOC STRINGS ARE EXEMPT: a
 *     guard that reads prose as code teaches people to delete the prose.
 *
 * A genuine exception goes in `scripts/no-default-organization.allowlist.json`
 * WITH A REASON — either a bare reason string (all five rules) or
 * `{ "rules": [3], "reason": "…" }` to forgive one rule only.
 *
 * Run:  pnpm check:no-default-organization
 *       pnpm check:no-default-organization:self-test   (proves it can FAIL)
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(
  ROOT,
  "scripts",
  "no-default-organization.allowlist.json",
);

const SCAN_DIRS = ["app", "features", "components", "providers", "hooks", "lib"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

/**
 * The TWO homes where a stated default organization is legitimate: the picker
 * itself, and the settings screen where the person states it. Both are display;
 * neither may hand the id to a data path.
 */
const PREFERENCE_HOMES: readonly RegExp[] = [
  /^features\/organizations\//,
  /^features\/settings\//,
];

/** Rule 2's one home, and the one function inside it. */
const PERSONAL_ORG_HOME = "lib/organizations/personalOrg.ts";
const PERSONAL_ORG_FUNCTION = "resolvePersonalOrgId";
const PERSONAL_ORG_RPCS = ["current_personal_org_id", "ensure_personal_organization"];

const SELECTOR = "selectDefaultOrganizationId";
/**
 * The ONE line that is not a consumer: the selector's own declaration. Every
 * other appearance — an import, a call, a re-export — is someone reading a
 * display preference to choose an organization.
 */
const SELECTOR_DECLARATION = new RegExp(
  `(?:export\\s+)?(?:const|let|var|function|class)\\s+${SELECTOR}\\b`,
  "g",
);

/**
 * Rule 1b — a function whose NAME says it reads the default organization out of
 * storage. `readDefaultOrgIdFromDb` is the instance; the shape is the class.
 */
const DEFAULT_ORG_READER_NAME =
  /\b(?:read|fetch|get|load|query|resolve)[A-Za-z0-9_]*Default[A-Za-z0-9_]*Org[A-Za-z0-9_]*\b/g;

/**
 * Rule 1a — the preference read. The table and the field must sit CLOSE
 * together: a query that opens `user_preferences` and plucks
 * `defaultOrganizationId` out of the blob a few lines later is choosing an
 * organization. The preferences STORE — which loads the whole blob in one place
 * and declares the field's type hundreds of lines away — is not, and must not be
 * dragged in, or the guard becomes noise people switch off.
 */
const PREFERENCE_TABLE = /\buser_preferences\b/g;
const PREFERENCE_FIELD = /\bdefaultOrganizationId\b/g;
const PREFERENCE_PROXIMITY_LINES = 30;

/** Rule 5 — the phrase, and the contexts in which a string reaches a person. */
const THE_PHRASE = /default\s+organi[sz]ation/i;
const USER_FACING_CONTEXTS: readonly { context: RegExp; what: string }[] = [
  {
    context: /(?:user_message|userMessage|title|description)\s*:\s*$/,
    what: "a user-facing field",
  },
  { context: /\bError\s*\([^()]*$/, what: "a thrown Error message" },
  { context: /\btoast(?:\.[A-Za-z_$][\w$]*)?\s*\([^()]*$/, what: "a toast" },
];

// ---------------------------------------------------------------------------
// The lexer. Every rule but 5 reads CODE (comments and, where noted, string
// contents removed); rule 5 reads STRINGS. Both come out of one pass so a rule
// can never disagree with another about what is code and what is prose.
//
// `check-org-three-states.stripComments` is the same idea by regex; this is the
// same approach made positional, because every finding here must print a LINE.
// ---------------------------------------------------------------------------

export interface StringSpan {
  /** Index of the first character of the string's CONTENT. */
  start: number;
  /** Index one past the last character of the content. */
  end: number;
  value: string;
}

export interface Lexed {
  /** Source with comment bodies blanked to spaces. Newlines preserved. */
  code: string;
  /** `code` with string CONTENTS also blanked. Newlines preserved. */
  bare: string;
  /** Every string / template chunk, in source order. */
  strings: StringSpan[];
}

export function lex(source: string): Lexed {
  const code = source.split("");
  const bare = source.split("");
  const strings: StringSpan[] = [];
  const blank = (from: number, to: number, alsoCode: boolean) => {
    for (let k = from; k < to && k < source.length; k += 1) {
      if (source[k] === "\n") continue;
      bare[k] = " ";
      if (alsoCode) code[k] = " ";
    }
  };

  const n = source.length;
  let i = 0;
  let inTemplate = false;
  let chunkStart = -1;
  let braceDepth = 0;
  const exprStack: number[] = [];

  const closeChunk = (end: number) => {
    if (chunkStart >= 0) {
      strings.push({ start: chunkStart, end, value: source.slice(chunkStart, end) });
      blank(chunkStart, end, false);
    }
    chunkStart = -1;
  };

  while (i < n) {
    const c = source[i];
    if (inTemplate) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        closeChunk(i);
        inTemplate = false;
        i += 1;
        continue;
      }
      if (c === "$" && source[i + 1] === "{") {
        closeChunk(i);
        exprStack.push(braceDepth);
        inTemplate = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = n;
      blank(i, end, true);
      i = end;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      let end = source.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      blank(i, end, true);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote || source[j] === "\n") break;
        j += 1;
      }
      strings.push({ start: i + 1, end: j, value: source.slice(i + 1, j) });
      blank(i + 1, j, false);
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === "`") {
      inTemplate = true;
      chunkStart = i + 1;
      i += 1;
      continue;
    }
    if (c === "{") {
      braceDepth += 1;
      i += 1;
      continue;
    }
    if (c === "}") {
      if (exprStack.length > 0 && braceDepth === exprStack[exprStack.length - 1]) {
        exprStack.pop();
        inTemplate = true;
        chunkStart = i + 1;
        i += 1;
        continue;
      }
      braceDepth -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  closeChunk(n);
  return { code: code.join(""), bare: bare.join(""), strings };
}

/** 1-based line number of `index` in `source`. */
export function lineOf(source: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index && k < source.length; k += 1) {
    if (source[k] === "\n") line += 1;
  }
  return line;
}

function lineText(source: string, index: number): string {
  let from = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  let to = source.indexOf("\n", index);
  if (to === -1) to = source.length;
  const text = source.slice(from, to).trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export interface AllowEntry {
  rules?: number[];
  reason: string;
}
export interface Allowlist {
  [file: string]: string | AllowEntry;
}

export function loadAllowlist(): Allowlist {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as Allowlist;
  for (const [file, entry] of Object.entries(parsed)) {
    const reason = typeof entry === "string" ? entry : entry?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new Error(
        `Allowlist entry "${file}" needs a real reason, not "${String(reason)}".`,
      );
    }
  }
  return parsed;
}

function isAllowed(allowlist: Allowlist, file: string, rule: number): boolean {
  const entry = allowlist[file];
  if (entry === undefined) return false;
  if (typeof entry === "string") return true;
  return !entry.rules || entry.rules.includes(rule);
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

export interface Violation {
  file: string;
  line: number;
  rule: number;
  text: string;
  why: string;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

function inPreferenceHome(rel: string): boolean {
  return PREFERENCE_HOMES.some((home) => home.test(rel));
}

/** The body of `resolvePersonalOrgId`, by brace matching over comment-free code. */
export function personalOrgFunctionBody(code: string): { start: number; end: number } | null {
  const match = new RegExp(`\\b${PERSONAL_ORG_FUNCTION}\\b`).exec(code);
  if (!match) return null;
  const open = code.indexOf("{", match.index);
  if (open === -1) return null;
  let depth = 0;
  for (let k = open; k < code.length; k += 1) {
    if (code[k] === "{") depth += 1;
    else if (code[k] === "}") {
      depth -= 1;
      if (depth === 0) return { start: match.index, end: k + 1 };
    }
  }
  return null;
}

const WHY = {
  1:
    "reads the stored default-organization preference to choose an org — a default " +
    "organization is at most a per-client DISPLAY preference (Arman, 2026-09-19), so no " +
    "data path may resolve an organization from it; outside the picker and settings this " +
    "must fail loudly instead.",
  2:
    "names the personal-organization RPC outside resolvePersonalOrgId — substituting the " +
    "person's personal org for the organization nobody asked about is exactly the ruling's " +
    "failure (Arman, 2026-09-19): the work lands in a workspace they never chose, silently.",
  3:
    "consumes the picker's selectDefaultOrganizationId outside the picker and settings — a " +
    "display preference becomes the organization a record is filed into, which is how orgs " +
    "stop existing (Arman, 2026-09-19).",
  4:
    "reads client Redux inside a route handler — the store does not exist server-side, so " +
    "this can only be the organization the browser happened to be showing, asserted as " +
    "truth; the ruling forbids any transport picking an org for the user (Arman, 2026-09-19).",
  5:
    'puts "default organization" in copy a person reads — it teaches them the system acts on ' +
    "a default organization, which the ruling forbids (Arman, 2026-09-19); name the " +
    "organization that is required and show the picker instead.",
} as const;

export function scanSource(rel: string, source: string): Violation[] {
  const found: Violation[] = [];
  const { code, bare, strings } = lex(source);
  const add = (rule: number, index: number, text: string) =>
    found.push({
      file: rel,
      line: lineOf(source, index),
      rule,
      text,
      why: WHY[rule as 1 | 2 | 3 | 4 | 5],
    });

  // RULE 1 — the DB default-org read.
  if (!inPreferenceHome(rel)) {
    const tableLines: number[] = [];
    for (const m of code.matchAll(PREFERENCE_TABLE)) {
      tableLines.push(lineOf(source, m.index ?? 0));
    }
    if (tableLines.length > 0) {
      for (const m of code.matchAll(PREFERENCE_FIELD)) {
        const idx = m.index ?? 0;
        const line = lineOf(source, idx);
        if (
          tableLines.some((t) => Math.abs(t - line) <= PREFERENCE_PROXIMITY_LINES)
        ) {
          add(
            1,
            idx,
            `defaultOrganizationId plucked out of user_preferences — ${lineText(source, idx)}`,
          );
        }
      }
    }
    for (const m of code.matchAll(DEFAULT_ORG_READER_NAME)) {
      add(1, m.index ?? 0, `${m[0]} — ${lineText(source, m.index ?? 0)}`);
    }
  }

  // RULE 2 — the personal-org RPC. A string whose WHOLE content is the RPC name
  // is a call (`.rpc("current_personal_org_id")`) or a name held for one; the
  // identifier in bare code is the same thing unquoted. A sentence that MENTIONS
  // the RPC — a log line, an Error message — invokes nothing and is left alone,
  // for the same reason comments are.
  {
    const body =
      rel === PERSONAL_ORG_HOME ? personalOrgFunctionBody(code) : null;
    const insideHome = (index: number) =>
      body !== null && index >= body.start && index < body.end;
    for (const rpc of PERSONAL_ORG_RPCS) {
      for (const span of strings) {
        if (span.value.trim() !== rpc) continue;
        if (insideHome(span.start)) continue;
        add(2, span.start, `"${rpc}" — ${lineText(source, span.start)}`);
      }
      for (const m of bare.matchAll(new RegExp(`\\b${rpc}\\b`, "g"))) {
        const idx = m.index ?? 0;
        if (insideHome(idx)) continue;
        add(2, idx, `${rpc} — ${lineText(source, idx)}`);
      }
    }
  }

  // RULE 3 — CONSUMERS of the picker's selector: an import of it, or a call to
  // it. Its own DECLARATION is not a consumer — the selector has to exist
  // somewhere, and the rule is about who reads it — so the one line that
  // declares it is excluded by shape, not by allowlist.
  if (!inPreferenceHome(rel)) {
    const declarations = new Set<number>();
    for (const m of code.matchAll(SELECTOR_DECLARATION)) {
      declarations.add((m.index ?? 0) + m[0].lastIndexOf(SELECTOR));
    }
    for (const m of code.matchAll(new RegExp(`\\b${SELECTOR}\\b`, "g"))) {
      const idx = m.index ?? 0;
      if (declarations.has(idx)) continue;
      add(3, idx, `${SELECTOR} — ${lineText(source, idx)}`);
    }
  }

  // RULE 4 — client Redux inside a route handler.
  if (rel.startsWith("app/api/")) {
    for (const m of code.matchAll(/\buseAppSelector\b/g)) {
      add(4, m.index ?? 0, `useAppSelector — ${lineText(source, m.index ?? 0)}`);
    }
  }

  // RULE 5 — the phrase in copy a person reads. Comments are already blanked, so
  // prose can never trip this.
  for (const span of strings) {
    if (!THE_PHRASE.test(span.value)) continue;
    const before = code.slice(Math.max(0, span.start - 260), span.start - 1);
    const hit = USER_FACING_CONTEXTS.find((c) => c.context.test(before));
    if (!hit) continue;
    add(5, span.start, `${hit.what}: "${span.value.trim().slice(0, 120)}"`);
  }

  return found;
}

/**
 * `extra` scans files IN MEMORY as if they sat at `rel`; `tree: false` skips the checkout walk.
 * The self-test plants through them — a fixture written into features/ or app/ was seen (and
 * reported, or read mid-delete) by every other check `scripts/checks/run.mjs` runs beside this one.
 */
export function scan(
  options: { allowlist?: Allowlist; extra?: Array<{ rel: string; source: string }>; tree?: boolean } = {},
): Violation[] {
  const allowlist = options.allowlist ?? loadAllowlist();
  const violations: Violation[] = [];
  const consider = (rel: string, source: string) => {
    for (const violation of scanSource(rel, source)) {
      if (isAllowed(allowlist, rel, violation.rule)) continue;
      violations.push(violation);
    }
  };
  if (options.tree !== false) {
    for (const dir of SCAN_DIRS) {
      for (const full of walk(join(ROOT, dir))) {
        let source: string;
        try {
          source = readFileSync(full, "utf8");
        } catch {
          continue;
        }
        consider(relative(ROOT, full).split("\\").join("/"), source);
      }
    }
  }
  for (const { rel, source } of options.extra ?? []) consider(rel, source);
  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule - b.rule,
  );
}

// ---------------------------------------------------------------------------
// Self-test — five violating shapes it MUST flag, five compliant ones it must NOT.
// ---------------------------------------------------------------------------

const PLANTS: Record<number, string> = {
  1: "features/notes/__self_test_planted_r1__.ts",
  2: "features/notes/__self_test_planted_r2__.ts",
  3: "features/notes/__self_test_planted_r3__.ts",
  4: "app/api/__self_test_planted_r4__.ts",
  5: "features/notes/__self_test_planted_r5__.ts",
};

const VIOLATING: Record<number, string> = {
  1: `import { supabase } from "@/utils/supabase/client";
async function readDefaultOrgIdFromDb(userId: string) {
  const { data } = await supabase
    .schema("users")
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = data?.preferences as { organization?: { defaultOrganizationId?: string | null } };
  return prefs?.organization?.defaultOrganizationId ?? null;
}
export default readDefaultOrgIdFromDb;
`,
  2: `import type { SupabaseClient } from "@supabase/supabase-js";
export async function ensureOrgIdHere(client: SupabaseClient, orgId?: string | null) {
  if (orgId) return orgId;
  const { data } = await client.rpc("current_personal_org_id");
  return data as string;
}
`,
  3: `"use client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";
export function useNewThingOrganization() {
  return useAppSelector(selectDefaultOrganizationId);
}
`,
  4: `import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
export async function GET() {
  const organizationId = useAppSelector(selectOrganizationId);
  return Response.json({ organizationId });
}
`,
  5: `import { toast } from "sonner";
export function warn() {
  toast.error("We could not save this", {
    description: "Set a default organization in settings and try again.",
  });
  throw new Error("No default organization is configured for this account.");
}
`,
};

const COMPLIANT: Record<number, string> = {
  // 1 — the organization is CARRIED, never rebuilt from a stored preference.
  1: `export async function loadForOrganization(organizationId: string) {
  if (!organizationId) throw new Error("organization_context_required");
  return organizationId;
}
`,
  // 2 — the one home resolves it; everyone else takes the id as an argument.
  2: `import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
export async function whoseWorkspace() {
  return resolvePersonalOrgId();
}
`,
  // 3 — the selected organization, not the stated default.
  3: `"use client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
export function useNewThingOrganization() {
  return useAppSelector(selectOrganizationId);
}
`,
  // 4 — a route handler reads the request, never the browser's store.
  4: `import { requireOrganizationContext } from "@/lib/organizations/requireOrganizationContext";
export async function GET(request: Request) {
  const organizationId = await requireOrganizationContext(request);
  return Response.json({ organizationId });
}
`,
  // 5 — the copy names the organization and offers the picker; the PROSE below
  //     says "default organization" and must not trip the rule.
  5: `import { toast } from "sonner";
// Never say "default organization" here: the ruling (2026-09-19) forbids the
/* system acting on a default organization at all. */
export function warn() {
  toast.error("We could not save this", {
    description: "Choose an organization to work in, then try again.",
  });
}
`,
};

function selfTest(): number {
  let failed = 0;
  const check = (label: string, actual: boolean, expected: boolean) => {
    const ok = actual === expected;
    console.log(
      `[self-test] ${ok ? "ok  " : "FAIL"} ${label} = ${actual} (expected ${expected})`,
    );
    if (!ok) failed += 1;
  };

  // Planted IN MEMORY at PLANTS[rule] — never written into the checkout.
  const plantAndScan = (rule: number, source: string): Violation[] => {
    const rel = PLANTS[rule];
    return scan({ allowlist: {}, tree: false, extra: [{ rel, source }] }).filter((v) => v.file === rel);
  };

  for (const rule of [1, 2, 3, 4, 5]) {
    const flagged = plantAndScan(rule, VIOLATING[rule]);
    check(
      `rule ${rule}: the violating shape is FLAGGED   `,
      flagged.some((v) => v.rule === rule && v.line > 0),
      true,
    );
    const clean = plantAndScan(rule, COMPLIANT[rule]);
    check(
      `rule ${rule}: the compliant shape is CLEARED   `,
      clean.some((v) => v.rule === rule),
      false,
    );
  }

  // Rule 5 specifically must never fire on prose — the class of guard that
  // teaches people to delete the comment that explains the rule.
  const prose = `// A doc comment about the default organization preference.
/* And a block comment: the default organization is display-only. */
export const x = 1;
`;
  check(
    "rule 5: a // and /* */ comment is NOT copy    ",
    plantAndScan(5, prose).length > 0,
    false,
  );

  // The allowlist forgives, and only the rules it names.
  const r3path = PLANTS[3];
  const r3plant = [{ rel: r3path, source: VIOLATING[3] }];
  const forgiven = scan({
    allowlist: { [r3path]: { rules: [3], reason: "planted by the self-test, with a reason" } },
    tree: false,
    extra: r3plant,
  }).some((v) => v.file === r3path && v.rule === 3);
  const scopedMiss = scan({
    allowlist: { [r3path]: { rules: [1], reason: "planted by the self-test, with a reason" } },
    tree: false,
    extra: r3plant,
  }).some((v) => v.file === r3path && v.rule === 3);
  check("allowlist: a named rule is forgiven         ", forgiven, false);
  check("allowlist: an UNnamed rule still fails      ", scopedMiss, true);

  // A reasonless allowlist entry is refused outright.
  let reasonlessRefused = false;
  try {
    loadAllowlistFrom({ "features/x.ts": "nope" });
  } catch {
    reasonlessRefused = true;
  }
  check("allowlist: a reasonless entry is refused    ", reasonlessRefused, true);

  // Rule 2's home: the RPC inside resolvePersonalOrgId is the ONE legal call,
  // and the same call in the next function over is not.
  const home = `import { supabase } from "@/utils/supabase/client";
export async function resolvePersonalOrgId(): Promise<string> {
  const { data } = await supabase.rpc("current_personal_org_id");
  return data as string;
}
export async function ensureOrgIdServer(client: any, orgId?: string | null) {
  if (orgId) return orgId;
  const { data } = await client.rpc("current_personal_org_id");
  return data as string;
}
`;
  const homeHits = scanSource(PERSONAL_ORG_HOME, home).filter((v) => v.rule === 2);
  check("rule 2: the one legal call is not flagged   ", homeHits.length === 1, true);
  check(
    "rule 2: the call outside the function IS flagged",
    homeHits.some((v) => v.line === 8),
    true,
  );
  check(
    "rule 2: a log line MENTIONING the RPC is prose  ",
    scanSource(
      "lib/organizations/other.ts",
      'console.warn("[x] current_personal_org_id() failed; falling back");\n',
    ).some((v) => v.rule === 2),
    false,
  );

  if (failed > 0) {
    console.error(`SELF-TEST FAILED: ${failed} expectation(s) did not hold.`);
    return 1;
  }
  console.log(
    "[self-test] PASS — each of the five rules fails on the defect and passes on the fix.",
  );
  return 0;
}

/** Split out so the self-test can prove the reason requirement without a file. */
function loadAllowlistFrom(parsed: Allowlist): Allowlist {
  for (const [file, entry] of Object.entries(parsed)) {
    const reason = typeof entry === "string" ? entry : entry?.reason;
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new Error(
        `Allowlist entry "${file}" needs a real reason, not "${String(reason)}".`,
      );
    }
  }
  return parsed;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const violations = scan();
  if (violations.length === 0) {
    console.log(
      "check-no-default-organization: OK — nothing but the picker chooses an organization.",
    );
    return 0;
  }
  console.error(
    `check-no-default-organization: ${violations.length} violation(s) — something other ` +
      `than the org picker is choosing an organization for the user:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [rule ${v.rule}]`);
    console.error(`      ${v.text}`);
    console.error(`      WHY: ${v.why}`);
  }
  console.error(
    `\nTHE RULING (Arman, 2026-09-19): a "default organization" is at most a per-client\n` +
      `DISPLAY preference. Nothing but the org picker and pure UI display may read it. No\n` +
      `data read, write, API route, server action, transport or boot ladder may pick an\n` +
      `organization for the user from a cookie, a saved preference, or the personal org.\n` +
      `Sole-membership auto-select is fine. Carry the organization the person SELECTED, or\n` +
      `fail loudly with the picker — never guess.\n` +
      `A genuine exception goes in scripts/no-default-organization.allowlist.json with a reason.`,
  );
  return 1;
}

// Only when RUN, never when imported: `scan` / `scanSource` are exported so a
// test (or an evidence harness) can hold the rules up against a source it
// supplies, and a module that exits the process on import cannot be held up
// against anything.
if (require.main === module) {
  try {
    exitAfterDrain(main());
  } catch (error) {
    console.error("check-no-default-organization: unexpected error", error);
    exitAfterDrain(2);
  }
}
