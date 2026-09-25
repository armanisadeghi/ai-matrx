#!/usr/bin/env npx tsx
/**
 * THE ADMIN LANE — admin power exists only inside the admin section.
 *
 * Arman, 2026-09-25: "Admin privileges cannot ever extend beyond the admin
 * sections of the system. A persona with admin privileges should see nothing
 * more than anyone else in any area of the normal user pages. The difference
 * can only work in the admin apps."
 *
 * The database half: every admin arm in RLS (is_platform_admin(),
 * is_super_admin(), is_admin(), the kernel admin rung) requires the request to
 * carry `x-matrx-admin-lane: 1`, which this app sends only from the admin
 * section (utils/supabase/adminLane.ts). The UI half: the default admin gates
 * (`selectIsSuperAdmin`, `selectIsAdmin`, `selectAdminLevel`) are false outside
 * the admin section.
 *
 * WHAT THIS GUARD ASSERTS (static, offline, blocking on any finding)
 *   1. No file outside the admin section calls the admin-check RPCs
 *      (`is_platform_admin`, `is_super_admin`, `is_admin`, `*_for`) — asking
 *      "am I an admin" from a user page is how a user page grows admin power.
 *      The identity question has its own RPCs (`is_platform_admin_person`,
 *      `is_super_admin_person`, `get_admin_status`) and they may only offer the
 *      way INTO the admin section.
 *   2. The ADMIN IDENTITY selectors (`selectIsAdminPerson`,
 *      `selectIsSuperAdminPerson`, `selectAdminLevelPerson`) are used only by
 *      the files in IDENTITY_ALLOWED — the way into the admin section and the
 *      sign-out warning. Anything else would be identity used as power.
 *   4. SERVER: no user-side file asks the raw identity question
 *      (`checkIsSuperAdmin`, `checkIsUserAdmin`, `getAdminStatus`,
 *      `getCurrentUserAdminStatus`) to widen what it does — it asks
 *      `hasAdminPower` / `requireSuperAdmin` / `requireAdmin`
 *      (utils/auth/adminLaneServer.ts), which also demand the admin lane.
 *      The identity readers that only render the shell or the sign-out warning
 *      are named in SERVER_IDENTITY_ALLOWED.
 *   5. `requireSuperAdmin` and `requireAdmin` (utils/auth/adminUtils.ts) still
 *      call `requireAdminLane()` before anything else — the one door every
 *      service-role admin action goes through.
 *   3. Every `app/(core)/<feature>/admin` directory (the per-feature admin
 *      maps) is named in `ADMIN_LANE_PATH_PREFIXES`, so a new admin map can
 *      never silently run without the lane. `/organizations/<id>/admin` is an
 *      organization's own admin and is excluded on purpose.
 *
 *   pnpm check:admin-lane              # exit 1 on any finding
 *   pnpm check:admin-lane --self-test  # RED on planted offenders, then GREEN
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ADMIN_LANE_PATH_PREFIXES } from "../utils/supabase/adminLane";

const ROOT = join(__dirname, "..");
const SELF_TEST = process.argv.includes("--self-test");

/** Source trees that are the admin section. Everything else is user side. */
const ADMIN_SECTION_DIRS = [
  "app/(admin)/",
  "app/api/admin/",
  "app/api/sms/admin/",
  "features/admin/",
  "features/administration/",
];

/** The only user-side files allowed to read ADMIN IDENTITY. */
const IDENTITY_ALLOWED = new Set([
  "lib/redux/selectors/userSelectors.ts",
  "lib/redux/slices/userSlice.ts",
  // The way INTO the admin section.
  "features/shell/components/sidebar/admin-menu/AdminSidebarSection.tsx",
  "features/shell/components/sidebar/admin-menu/AdminMobileMenuItem.tsx",
  "components/matrx/PublicHeaderAuth.tsx",
  // Protects the person's session; grants nothing.
  "features/shell/auth/useSignOut.ts",
]);

const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "utils", "providers", "actions"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);

const ADMIN_RPC =
  /\.rpc\(\s*["'`](is_platform_admin|is_super_admin|is_admin|is_super_admin_for|is_platform_admin_for)["'`]/;
const IDENTITY_SELECTOR = /\b(selectIsAdminPerson|selectIsSuperAdminPerson|selectAdminLevelPerson)\b/;

/** User-side server files allowed to read raw admin IDENTITY (never power). */
const SERVER_IDENTITY_ALLOWED = new Set([
  "utils/supabase/userSessionData.ts",
  "utils/auth/adminUtils.ts",
  "utils/auth/adminLaneServer.ts",
  // Shell identity: seeds `userAuth.isAdmin/adminLevel` (power needs the lane).
  "app/(core)/layout.tsx",
  "app/(dev)/layout.dev.tsx",
  "app/(meet)/layout.tsx",
  "app/(transitional)/layout.tsx",
  "lib/auth/authedLayoutData.ts",
  // The super-admin sign-out warning protects the person; grants nothing.
  "app/(auth-pages)/sign-out/page.tsx",
  // Pairs identity with `requestInAdminLane()` on the same line of logic.
  "app/(core)/education/library/community/page.tsx",
]);

const SERVER_IDENTITY_CALL =
  /\b(checkIsSuperAdmin|checkIsUserAdmin|getAdminStatus|getCurrentUserAdminStatus)\(/;

export interface Finding {
  file: string;
  rule:
    | "admin-rpc-on-user-side"
    | "identity-as-power"
    | "admin-map-without-lane"
    | "server-identity-as-power"
    | "admin-door-without-lane";
  detail: string;
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

export function isAdminSectionFile(file: string): boolean {
  if (ADMIN_SECTION_DIRS.some((d) => file.startsWith(d))) return true;
  // app/(core)/<feature>/.../admin/** — the per-feature admin maps.
  return /^app\/\(core\)\/(?!organizations\/)[^]*\/admin\//.test(file);
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes("/__tests__/");
}

/** Pure detector over one file, so --self-test can feed it planted offenders. */
export function scanSource(file: string, source: string): Finding[] {
  if (isTestFile(file) || isAdminSectionFile(file)) return [];
  const findings: Finding[] = [];
  source.split("\n").forEach((line, i) => {
    if (ADMIN_RPC.test(line)) {
      findings.push({
        file,
        rule: "admin-rpc-on-user-side",
        detail: `line ${i + 1}: ${line.trim()} — a user-side file asks the admin-POWER question. Use the default gates (selectIsSuperAdmin, false outside the admin section) or move the surface under /administration.`,
      });
    }
    const code = line.trim();
    const isComment = code.startsWith("//") || code.startsWith("*") || code.startsWith("/*");
    if (
      !isComment &&
      SERVER_IDENTITY_CALL.test(line) &&
      !/\bfunction\s+(checkIsSuperAdmin|checkIsUserAdmin|getAdminStatus|getCurrentUserAdminStatus)\b/.test(line) &&
      !SERVER_IDENTITY_ALLOWED.has(file)
    ) {
      findings.push({
        file,
        rule: "server-identity-as-power",
        detail: `line ${i + 1}: ${code} — a user-side server file asks "is this person an admin" to widen what it does. Use hasAdminPower(...) or requireSuperAdmin() (utils/auth/adminLaneServer.ts), which also demand the admin lane.`,
      });
    }
    if (IDENTITY_SELECTOR.test(line) && !IDENTITY_ALLOWED.has(file)) {
      findings.push({
        file,
        rule: "identity-as-power",
        detail: `line ${i + 1}: ${line.trim()} — admin IDENTITY may only offer the way into the admin section. Gate on selectIsSuperAdmin (admin power) instead, or add this file to IDENTITY_ALLOWED with the reason if it is truly a way in.`,
      });
    }
  });
  return findings;
}

/** Pure detector: the shared admin doors still demand the lane first. */
export function scanAdminDoors(adminUtilsSource: string): Finding[] {
  const findings: Finding[] = [];
  for (const fn of ["requireSuperAdmin", "requireAdmin"]) {
    const start = adminUtilsSource.indexOf(`export async function ${fn}(`);
    const body = start < 0 ? "" : adminUtilsSource.slice(start, adminUtilsSource.indexOf("\n}\n", start));
    if (!/await requireAdminLane\(\);/.test(body)) {
      findings.push({
        file: "utils/auth/adminUtils.ts",
        rule: "admin-door-without-lane",
        detail: `${fn}() no longer calls requireAdminLane() — every service-role admin action behind it would work from a user page.`,
      });
    }
  }
  return findings;
}

/** Pure detector over the (core) admin-map directories. */
export function scanAdminMaps(
  coreAdminRoutes: string[],
  prefixes: readonly string[],
): Finding[] {
  return coreAdminRoutes
    .filter((route) => !route.startsWith("/organizations/"))
    .filter((route) => !prefixes.includes(route))
    .map((route) => ({
      file: `app/(core)${route}`,
      rule: "admin-map-without-lane" as const,
      detail: `${route} is a per-feature admin map with no entry in ADMIN_LANE_PATH_PREFIXES (utils/supabase/adminLane.ts) — its admin reads would run without the lane.`,
    }));
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(toPosix(relative(ROOT, full)));
  }
}

function coreAdminRoutes(): string[] {
  const routes: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (name === "admin") {
        const route = toPosix(relative(join(ROOT, "app/(core)"), full))
          .split("/")
          .filter((seg) => !/^\(.*\)$/.test(seg))
          .join("/");
        routes.push(`/${route}`);
        continue;
      }
      visit(full);
    }
  };
  visit(join(ROOT, "app/(core)"));
  return routes;
}

function report(findings: Finding[]): void {
  for (const f of findings) console.error(`  ✗ [${f.rule}] ${f.file}\n      ${f.detail}`);
}

function runLive(): Finding[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    try {
      walk(join(ROOT, d), files);
    } catch {
      // a missing top-level dir is not a finding
    }
  }
  const findings: Finding[] = [];
  for (const file of files) findings.push(...scanSource(file, readFileSync(join(ROOT, file), "utf8")));
  findings.push(...scanAdminMaps(coreAdminRoutes(), ADMIN_LANE_PATH_PREFIXES));
  findings.push(...scanAdminDoors(readFileSync(join(ROOT, "utils/auth/adminUtils.ts"), "utf8")));
  return findings;
}

function selfTest(): void {
  const planted: Array<[string, string]> = [
    ["features/notes/NotesPage.tsx", `const { data } = await supabase.rpc("is_platform_admin");`],
    ["features/notes/NotesPage.tsx", `const x = useAppSelector(selectIsSuperAdminPerson);`],
    ["app/api/cms/sites/route.ts", `  const ok = await checkIsSuperAdmin(supabase, user.id);`],
  ];
  const red = [
    ...planted.flatMap(([f, s]) => scanSource(f, s)),
    ...scanAdminMaps(["/newfeature/admin"], ADMIN_LANE_PATH_PREFIXES),
    ...scanAdminDoors(
      `export async function requireSuperAdmin(): Promise<string> {\n  const status = 1;\n}\nexport async function requireAdmin(): Promise<string> {\n  await requireAdminLane();\n}\n`,
    ),
  ];
  const rules = new Set(red.map((f) => f.rule));
  const allRed = rules.size === 5;
  console.log(`self-test RED: ${red.length} planted finding(s) across ${rules.size}/5 rules`);
  if (!allRed) {
    console.error("self-test FAILED: a planted offender was not detected");
    process.exit(1);
  }
  const allowed = [
    ...scanSource("app/(admin)/administration/x/page.tsx", `await supabase.rpc("is_super_admin");`),
    ...scanSource("app/(core)/agents/admin/page.tsx", `await supabase.rpc("is_super_admin");`),
    ...scanSource("features/shell/auth/useSignOut.ts", `useAppSelector(selectIsSuperAdminPerson)`),
    ...scanSource("app/(auth-pages)/sign-out/page.tsx", `await checkIsSuperAdmin(supabase, user.id);`),
    ...scanSource("app/api/admin/users/route.ts", `await checkIsSuperAdmin(supabase, user.id);`),
    ...scanSource("app/api/cms/sites/route.ts", `// the old checkIsSuperAdmin(supabase, id) gate`),
    ...scanAdminMaps(["/organizations/[orgId]/admin", "/agents/admin"], ADMIN_LANE_PATH_PREFIXES),
  ];
  if (allowed.length > 0) {
    console.error("self-test FAILED: an allowed shape was flagged");
    report(allowed);
    process.exit(1);
  }
  const live = runLive();
  if (live.length > 0) {
    console.error(`self-test FAILED on the live tree: ${live.length} finding(s)`);
    report(live);
    process.exit(1);
  }
  console.log("self-test GREEN: allowed shapes pass and the live tree is clean");
}

if (require.main === module) {
  if (SELF_TEST) {
    selfTest();
  } else {
    const findings = runLive();
    if (findings.length > 0) {
      console.error(`check:admin-lane — ${findings.length} finding(s):`);
      report(findings);
      process.exit(1);
    }
    console.log("check:admin-lane — clean: no user-side admin power, every admin map rides the lane");
  }
}
