#!/usr/bin/env npx tsx
/**
 * check:admin-no-personal-seat — the admin seat never acts as itself, and an
 * admin MANAGEMENT page never browses tenants.
 *
 * 🚨 THE RULES (Arman, 2026-09-26):
 *   "No one acts as themselves in admin. An admin cannot ever act as
 *    themselves, so the concept of 'mine' is ridiculous and 'my org' is
 *    ridiculous. Make sure that concept doesn't exist in admin… anywhere."
 *   And (asked five times): an admin management page — e.g. the admin mandate
 *   page — exists to manage the PLATFORM's own records (creating, editing,
 *   binding, updating them). It shows those records only, with no System /
 *   Organizations / Users / All lanes. Looking into an organization's or a
 *   person's records is tech support, and lives ONLY on a separate support
 *   route (a path with a `support` segment, e.g.
 *   /administration/intelligence/mandates/support), which may declare
 *   `ADMIN_SUPPORT_LIST_SCOPES` (lib/list-scope/types.ts).
 *
 * WHAT THIS FLAGS, in every file an `app/(admin)/**` route reaches through its
 * imports within MAX_DEPTH hops (a shared component rendered by an admin page
 * is an admin surface; app chrome and surface manifests are not followed):
 *   1. SCOPE LANES — `scopes: [...]` / `scopes={[...]}` array literals that
 *      name "mine", "orgs" or "shared", and `defaultScope={{ kind: "mine" |
 *      "orgs" | "shared" }}`. (Every admin route, support routes included.)
 *   2. SEAT LABELS — the string literal or JSX text "Mine", "My Orgs",
 *      "My Organizations". (Every admin route.)
 *   3. TENANT LANES ON A MANAGEMENT PAGE — in files a MANAGEMENT route (any
 *      admin route without a `support` path segment) reaches: the tenant scope
 *      words "platform_orgs" / "platform_users" / "platform_all" and
 *      `ADMIN_SUPPORT_LIST_SCOPES`. A file reached ONLY by support routes may
 *      use them freely. A shared file that serves a support route too keeps
 *      the tenant word inside the support branch, and that line carries
 *      `admin-support-only: <which support route>`.
 *
 * NOT scanned: lib/list-scope and lib/entity-list (they DEFINE the vocabulary
 * for user pages too), tests, and demo displays (official-components, mock
 * data).
 *
 * THE ONE LEGAL POSTURE for a shared component that serves user pages too: the
 * PAGE passes the scope (a management page: `scopes={["system"]}` with
 * `scopeTabs={false}`), or the component branches on `adminDoorOpen()`. A line
 * that must keep a user word inside such a branch carries
 * `personal-seat-ok: <reason>` on the same line or the line above — a reason
 * is required.
 *
 *   pnpm check:admin-no-personal-seat
 *   pnpm check:admin-no-personal-seat --self-test   prove every rule RED then GREEN
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.join(ROOT, "app", "(admin)");
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

const NOT_SCANNED = [
  /\/lib\/list-scope\//,
  /\/lib\/entity-list\//,
  /\/node_modules\//,
  /\.test\.tsx?$/,
  /\/__tests__\//,
  /\/administration\/ui\/official-components\//,
  /mock-data\.ts$/,
];
// Imports never followed (infrastructure, not surfaces) — keeps the walk fast.
const NOT_FOLLOWED = [
  /\/lib\/redux\//,
  /\/types\//,
  /\/utils\/supabase\//,
  /\/components\/ui\//,
  // App chrome and metadata every page carries (the user menu, nav data,
  // surface manifests) — not the admin page's own content.
  /\/features\/shell\//,
  /\/features\/surfaces\/manifests\//,
];
// How far into the import graph an admin page's CONTENT reaches: the route
// file, its page component, that component's parts, and their parts. Deeper
// hops are generic plumbing shared by every page.
const MAX_DEPTH = 4;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTS) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(p, out);
    else if (/\.(tsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:from|import\()\s*["']([^"']+)["']/g;

/** An admin route file under a `support` path segment — a tech-support tool. */
export function isSupportRouteFile(file: string): boolean {
  return path
    .relative(ADMIN_ROOT, file)
    .split(path.sep)
    .includes("support");
}

function reachableFrom(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue: [string, number][] = roots.map((f) => [f, 0]);
  for (const [f] of queue) seen.add(f);
  for (let i = 0; i < queue.length; i += 1) {
    const [file, depth] = queue[i];
    if (depth >= MAX_DEPTH) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, match[1]);
      if (!target || seen.has(target)) continue;
      if (NOT_FOLLOWED.some((re) => re.test(target))) continue;
      seen.add(target);
      queue.push([target, depth + 1]);
    }
  }
  return seen;
}

interface Finding {
  file: string;
  line: number;
  rule: "scope-lane" | "seat-label" | "tenant-lane-on-management-page";
  text: string;
}

const PERSONAL = `"(?:mine|orgs|shared)"`;
const SCOPE_ARRAY_RE = new RegExp(`scopes\\s*(?::|=\\{)\\s*\\[[^\\]]*${PERSONAL}`, "s");
const DEFAULT_SCOPE_RE = new RegExp(`defaultScope=\\{\\{\\s*kind:\\s*${PERSONAL}`);
const LABEL_RE = /(["'`])(?:Mine|My Orgs|My Organizations)\1|>\s*(?:Mine|My Orgs|My Organizations)\s*</;
const ALLOW_RE = /personal-seat-ok:\s*\S+/;
// ADMIN_LIST_SCOPES is the RETIRED name of the four-lane admin set (System /
// Organizations / Users / All) that put tenant lanes on management pages;
// bringing it back is the same defect.
const TENANT_RE = /(["'`])platform_(?:orgs|users|all)\1|\bADMIN_(?:SUPPORT_)?LIST_SCOPES\b/;
const SUPPORT_ONLY_RE = /admin-support-only:\s*\S+/;

/**
 * Rule 3 — a file a MANAGEMENT route reaches never names a tenant lane, except
 * on a line (or the line below one) marked `admin-support-only: <route>`.
 */
export function scanManagementText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  const allowed = (i: number) =>
    SUPPORT_ONLY_RE.test(lines[i]) || (i > 0 && SUPPORT_ONLY_RE.test(lines[i - 1]));
  lines.forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*).*$/, "").replace(/\/\/.*$/, "");
    if (TENANT_RE.test(code) && !allowed(i)) {
      findings.push({ file, line: i + 1, rule: "tenant-lane-on-management-page", text: line.trim() });
    }
  });
  return findings;
}

export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  const allowed = (i: number) => ALLOW_RE.test(lines[i]) || (i > 0 && ALLOW_RE.test(lines[i - 1]));
  // Scope arrays can span lines: test each `scopes` occurrence over a window.
  lines.forEach((line, i) => {
    if (/scopes\s*(?::|=\{)\s*\[/.test(line)) {
      const window = lines.slice(i, i + 12).join("\n");
      const closing = window.indexOf("]");
      const slice = closing >= 0 ? window.slice(0, closing + 1) : window;
      if (SCOPE_ARRAY_RE.test(slice) && !allowed(i)) {
        findings.push({ file, line: i + 1, rule: "scope-lane", text: line.trim() });
      }
    }
    if (DEFAULT_SCOPE_RE.test(line) && !allowed(i)) {
      findings.push({ file, line: i + 1, rule: "scope-lane", text: line.trim() });
    }
    const code = line.replace(/^\s*(\/\/|\*).*$/, "");
    if (LABEL_RE.test(code) && !allowed(i)) {
      findings.push({ file, line: i + 1, rule: "seat-label", text: line.trim() });
    }
  });
  return findings;
}

/**
 * `--self-test`: every rule is shown RED on a planted violation and GREEN on
 * the legal posture, from text in memory — no real file is ever mutated.
 */
function selfTest(): void {
  const cases: { name: string; findings: Finding[]; expectRed: boolean }[] = [
    {
      name: "management page declaring the four admin lanes",
      findings: scanManagementText("x.tsx", 'scopes: ["system", "platform_orgs", "platform_users", "platform_all"],'),
      expectRed: true,
    },
    {
      name: "management page importing the support scopes",
      findings: scanManagementText("x.tsx", "  scopes: ADMIN_SUPPORT_LIST_SCOPES,"),
      expectRed: true,
    },
    {
      name: "management page opening on a tenant lane",
      findings: scanManagementText("x.tsx", 'defaultScope={{ kind: "platform_all" }}'),
      expectRed: true,
    },
    {
      name: "management page: system only, no tabs",
      findings: scanManagementText("x.tsx", 'scopes={["system"]}\nscopeTabs={false}'),
      expectRed: false,
    },
    {
      name: "shared file: tenant lane inside the support branch, marked",
      findings: scanManagementText(
        "x.tsx",
        "  // admin-support-only: /administration/intelligence/mandates/support\n  scopes: ADMIN_SUPPORT_LIST_SCOPES,",
      ),
      expectRed: false,
    },
    {
      name: "a comment that merely mentions platform_all",
      findings: scanManagementText("x.tsx", '// "platform_all" is the support route\'s view'),
      expectRed: false,
    },
    { name: "personal lane", findings: scanText("x.tsx", 'scopes: ["mine", "system"],'), expectRed: true },
    { name: "seat label", findings: scanText("x.tsx", 'label: "My Orgs",'), expectRed: true },
    { name: "system alone", findings: scanText("x.tsx", 'scopes: ["system"],'), expectRed: false },
  ];
  let failed = 0;
  for (const c of cases) {
    const red = c.findings.length > 0;
    const ok = red === c.expectRed;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.expectRed ? "RED  " : "GREEN"}  ${c.name}`);
  }
  const support = path.join(ADMIN_ROOT, "administration", "intelligence", "mandates", "support", "page.tsx");
  const management = path.join(ADMIN_ROOT, "administration", "intelligence", "mandates", "page.tsx");
  const routesOk = isSupportRouteFile(support) && !isSupportRouteFile(management);
  if (!routesOk) failed += 1;
  console.log(`${routesOk ? "ok  " : "FAIL"}  route split: …/mandates/support is support, …/mandates is management`);
  if (failed > 0) {
    console.error(`check:admin-no-personal-seat --self-test — ${failed} case(s) wrong.`);
    process.exit(1);
  }
  console.log("check:admin-no-personal-seat --self-test — every rule RED on its violation, GREEN on the legal posture.");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const routes = listFiles(ADMIN_ROOT);
  const scanned = (files: Set<string>) =>
    [...files].filter((f) => !NOT_SCANNED.some((re) => re.test(f)));
  const files = scanned(reachableFrom(routes));
  const managementFiles = scanned(reachableFrom(routes.filter((f) => !isSupportRouteFile(f))));
  const findings = [
    ...files.flatMap((f) => scanText(path.relative(ROOT, f), fs.readFileSync(f, "utf8"))),
    ...managementFiles.flatMap((f) =>
      scanManagementText(path.relative(ROOT, f), fs.readFileSync(f, "utf8")),
    ),
  ];
  if (findings.length === 0) {
    console.log(
      `check:admin-no-personal-seat — clean: ${files.length} files reachable from app/(admin) carry no Mine / My Orgs / Shared scope or label, ` +
        `and the ${managementFiles.length} a management page reaches name no tenant lane outside a marked support branch.`,
    );
    return;
  }
  console.error(
    `check:admin-no-personal-seat — ${findings.length} admin-seat violation(s).\n` +
      `No one acts as themselves in admin, and an admin MANAGEMENT page shows only the platform's own records (Arman, 2026-09-26).\n` +
      `A management page declares scopes={["system"]} with scopeTabs={false}. Browsing an organization's or a person's records\n` +
      `lives only on a separate support route (…/support) using ADMIN_SUPPORT_LIST_SCOPES from lib/list-scope/types.ts;\n` +
      `a shared file keeps that inside the support branch on a line marked \`admin-support-only: <support route>\`.\n`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
  process.exit(1);
}

main();
