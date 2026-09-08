/**
 * check-cross-deployment-links — the guard for THE CROSS-DEPLOYMENT PREFETCH
 * CLASS.
 *
 * WHAT HAPPENED (production, 2026-09-08). This repo builds into three Vercel
 * projects; `www` does not compile `(admin)`, and `proxy.ts` redirects
 * `/administration/*` to `manage.aimatrx.com`. A `next/link` to an INTERNAL
 * href prefetches on hover with an RSC `fetch()` — a preflighted cross-origin
 * request the moment the proxy redirects it — and a preflight may not be
 * redirected:
 *
 *   Access to fetch at 'https://manage.aimatrx.com/administration/launchpad'
 *   (redirected from 'https://www.aimatrx.com/administration/launchpad?_rsc=…')
 *   … blocked by CORS policy: Redirect is not allowed for a preflight request.
 *
 * Every hover over the Administration menu on www screamed, and the click paid
 * a second failed RSC fetch before Next fell back to a document navigation.
 *
 * THE RULE THIS ENFORCES. A link or a router push to a split surface
 * (`lib/deployment/surfaces.ts`) goes through the door — `AppLink` /
 * `pushAppHref` / `replaceAppHref` — which turns it into an absolute
 * sibling-origin url on a build that cannot serve it. Files that live INSIDE
 * the surface's own route group are exempt: they only ever render on the
 * deployment that owns the path, so the link is same-origin by construction.
 *
 * Advisory by default (screams, exit 0); `--strict` exits non-zero for the
 * release gates. `--self-test` proves the detector still catches the original
 * defect — a guard nobody has seen fail is not a guard.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Route prefixes owned by a deployment that not every profile compiles. */
const SPLIT_PREFIXES = ["/administration", "/demos"] as const;

/**
 * Trees that only ever render on the deployment owning the path. `app/(admin)`
 * and `app/(dev)` are the route groups themselves; the `features/**` entries
 * are their page bodies, imported by nothing else (verified by the census that
 * produced this list — see FEATURE notes).
 */
const EXEMPT_PREFIXES = [
  "app/(admin)/",
  "app/(dev)/",
  "scripts/",
  "lib/deployment/",
  "components/navigation/",
  "proxy.ts",
];

/**
 * A `<Link>` opening tag, tag body and all. JSX puts `href` on its own line as
 * often as not, so this matches the whole tag rather than a line — the first
 * census missed the sidebar's own Administration link that way.
 */
const LINK_TAG = /<([A-Z][A-Za-z0-9_]*)(\s[^>]*?)\/?>/gs;

/**
 * Elements a split href may reach directly. `AppLink` IS the door. A plain
 * lowercase `<a>` is fine too and never matches above: it makes a document
 * navigation, which the proxy redirect handles correctly — it is the Next
 * ROUTER that must never be handed one.
 */
const DOOR_ELEMENTS = new Set([
  "AppLink",
  // Local wrappers that own an anchor and render it through AppLink. Each was
  // read and converted when this guard was written; a wrapper added here that
  // does not go through the door re-opens the class.
  "SectionLink", // features/admin/applications/overview/components/ApplicationsOverview.tsx
  "KpiTile", // features/administration/canonicalization/components/CanonicalizationOverview.tsx
  "LinkMenuItem", // features/shell/components/header/header-right-menu/LinkMenuItem.tsx
  "ExternalTabLink", // features/admin/components/FeatureAdminPage.tsx
  "Door", // features/admin/relationships/access-planner/AccessPlannerImpl.tsx
  "LineageRow", // features/agents/components/agent-listings/AgentLineageTree.tsx
  "SettingsLink", // components/official/settings/primitives/SettingsLink.tsx
  "ResultRow", // features/tool-registry/mcp-admin/components/AddMcpServerDialog.tsx — plain <a>
]);
const SPLIT_HREF =
  /href\s*=\s*[{]?\s*[`"']((?:\/administration|\/demos)[^`"'{]*)/;

/**
 * `export const NAME = "/administration…"` — a split path reached through a
 * CONSTANT, which no literal search can see.
 *
 * 🚨 This is not hypothetical tidiness. The first census of this defect missed
 * `AdminSidebarSection`'s `href={ADMIN_LAUNCHPAD_PATH}` — the sidebar's Admin
 * Launchpad button, which is the EXACT link whose hover produced the CORS error
 * in the console. A literal-only guard would have reported the class closed
 * while the reproduction still fired.
 */
const SPLIT_CONSTANT_DECL =
  /export\s+const\s+([A-Z][A-Z_0-9]*)\s*(?::[^=]+)?=\s*["'](?:\/administration|\/demos)/g;
const OFFENDING_PUSH =
  /router\s*\.\s*(?:push|replace)\s*\(\s*[`"']((?:\/administration|\/demos)[^`"']*)/;

/** 1-indexed line number of a character offset. */
function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

interface Offence {
  file: string;
  line: number;
  text: string;
  why: string;
}

/** Every exported constant in the repo whose value is a split-surface path. */
function splitConstants(files: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const decl of source.matchAll(SPLIT_CONSTANT_DECL)) names.add(decl[1]);
  }
  return names;
}

function sourceFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "*.tsx", "*.ts"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

function exempt(file: string): boolean {
  if (file.includes(".test.") || file.includes("__tests__/")) return true;
  return EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/** Every offence in one file's text — exported so `--self-test` can drive it. */
export function scanSource(
  file: string,
  source: string,
  constants: ReadonlySet<string> = new Set(),
): Offence[] {
  const found: Offence[] = [];
  const constantHref = constants.size
    ? new RegExp(`href\\s*=\\s*[{]\\s*(${[...constants].join("|")})\\s*[}]`)
    : null;
  for (const tag of source.matchAll(LINK_TAG)) {
    const element = tag[1];
    if (DOOR_ELEMENTS.has(element)) continue;
    const href =
      SPLIT_HREF.exec(tag[2]) ?? (constantHref ? constantHref.exec(tag[2]) : null);
    if (!href) continue;
    found.push({
      file,
      line: lineOf(source, tag.index ?? 0),
      text: tag[0].replace(/\s+/g, " ").slice(0, 160),
      why:
        `<${element} href="${href[1]}"> hands a split-surface path to a React ` +
        `component. If it renders a next/link <Link>, the RSC prefetch is ` +
        `preflighted, the proxy redirects it, and the browser refuses the ` +
        `redirect. Route it through AppLink ` +
        `("@/components/navigation/AppLink") — inside the wrapper if the ` +
        `wrapper owns the anchor.`,
    });
  }
  source.split("\n").forEach((text, index) => {
    const push = OFFENDING_PUSH.exec(text);
    if (push) {
      found.push({
        file,
        line: index + 1,
        text: text.trim(),
        why:
          `router.push/replace to ${push[1]} makes the same RSC fetch. Use ` +
          `pushAppHref/replaceAppHref from "@/lib/deployment/navigate".`,
      });
    }
  });
  return found;
}

/**
 * The detector, run against the exact code the production defect was made of
 * and against the fix that replaced it. Fails loudly if either verdict flips.
 */
function selfTest(): number {
  const defect = [
    'import Link from "next/link";',
    '<Link\n  href="/administration/launchpad"\n  data-nav-href="/administration"\n>Admin Launchpad</Link>',
    'router.push("/administration/mandates");',
    // The sidebar button whose hover produced the console error, reached
    // through a constant rather than a literal.
    "<Link href={ADMIN_LAUNCHPAD_PATH} target=\"_blank\">Admin Launchpad</Link>",
  ].join("\n");
  const fixed = [
    'import AppLink from "@/components/navigation/AppLink";',
    '<AppLink href="/administration/launchpad">Admin Launchpad</AppLink>',
    'pushAppHref(router, "/administration/mandates");',
    "<AppLink href={ADMIN_LAUNCHPAD_PATH} target=\"_blank\">Admin Launchpad</AppLink>",
  ].join("\n");
  const known = new Set(["ADMIN_LAUNCHPAD_PATH"]);
  const onDefect = scanSource("selftest.tsx", defect, known);
  const onFixed = scanSource("selftest.tsx", fixed, known);
  const problems: string[] = [];
  if (onDefect.length !== 3)
    problems.push(
      `expected 3 offences in the production defect, detector found ${onDefect.length}`,
    );
  if (onFixed.length !== 0)
    problems.push(
      `expected 0 offences in the fixed form, detector found ${onFixed.length}`,
    );
  if (problems.length) {
    console.error("\x1b[41m\x1b[97m SELF-TEST FAILED \x1b[0m");
    for (const problem of problems) console.error(`  • ${problem}`);
    return 2;
  }
  console.log(
    "✓ Self-test: the detector still catches the 2026-09-08 defect — literal href, router push, and the constant href of the very button that reproduced it (3 offences) — and passes its fix (0).",
  );
  return 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const strict = process.argv.includes("--strict");
  const offences: Offence[] = [];
  const files = sourceFiles();
  const constants = splitConstants(files);
  for (const file of files) {
    if (exempt(file)) continue;
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    offences.push(...scanSource(file, source, constants));
  }

  if (offences.length === 0) {
    console.log(
      "✓ Cross-deployment links: every link and push to a split surface goes through the door.",
    );
    return 0;
  }

  console.error(
    `\n\x1b[41m\x1b[97m CROSS-DEPLOYMENT LINK \x1b[0m ${offences.length} link(s)/push(es) that break with a CORS preflight on www:\n`,
  );
  for (const offence of offences) {
    console.error(`  • ${offence.file}:${offence.line}`);
    console.error(`    ${offence.text}`);
    console.error(`    ${offence.why}\n`);
  }
  return strict ? 2 : 0;
}

if (!process.argv.includes("--as-module")) process.exit(main());
