#!/usr/bin/env tsx
/**
 * Page header guard — catches route pages that render faux top bars in the
 * page body instead of injecting controls into the shell via <PageHeader>.
 *
 * The shell header owns the left (sidebar toggle) and right (avatar) edges.
 * Route toolbars belong in the center injection zone only — otherwise actions
 * with ml-auto / justify-between drift behind the avatar.
 *
 * Modes:
 *   pnpm check:page-headers          scan all route files under app/
 *   pnpm check:page-headers --strict exit 1 when violations found
 *
 * See features/shell/components/header/variants/USAGE.md
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "app");

const ROUTE_GLOBS = [
  "(core)",
  "(dev)",
  "(public)",
  "(public-demos)",
  "(popup)",
] as const;

/** Class combos agents use for in-body faux page headers (not sub-toolbars). */
const FAUX_HEADER_MARKERS = [
  "border-b border-border bg-card",
  "flex-shrink-0 border-b border-border bg-card",
  "flex-shrink-0 p-4 border-b border-border bg-card",
] as const;

interface Violation {
  file: string;
  reason: string;
}

function parseArgs(): { strict: boolean } {
  const strict = process.argv.includes("--strict");
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log("Usage: check-page-headers [--strict]");
    process.exit(0);
  }
  return { strict };
}

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (
      entry === "page.tsx" ||
      entry.endsWith("Client.tsx") ||
      entry.endsWith("LayoutClient.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

function isRouteFile(path: string): boolean {
  const rel = relative(APP_DIR, path);
  return ROUTE_GLOBS.some((group) => rel.startsWith(`${group}/`));
}

function scanFile(path: string): Violation[] {
  const rel = relative(ROOT, path);
  const src = readFileSync(path, "utf8");

  const hasPageHeader =
    src.includes("PageHeader") ||
    src.includes("PageSpecificHeaderPortal") ||
    src.includes("AppletHeader");

  const marker = FAUX_HEADER_MARKERS.find((m) => src.includes(m));
  if (!marker) return [];

  if (hasPageHeader) {
    // Still flag when both exist — the faux bar is almost always the bug.
    return [
      {
        file: rel,
        reason: `Contains in-body faux header (\`${marker}\`) even though PageHeader is imported — move toolbar actions into <PageHeader> and keep only in-page sub-bars below the shell header offset.`,
      },
    ];
  }

  return [
    {
      file: rel,
      reason: `Missing <PageHeader> — in-body faux header (\`${marker}\`) will overlap the shell avatar. Portal the header via PageHeader (see agent build route).`,
    },
  ];
}

function main() {
  const { strict } = parseArgs();
  const files = walkTsx(APP_DIR).filter(isRouteFile);
  const violations = files.flatMap(scanFile);

  if (violations.length === 0) {
    console.log("✓ No faux page-header violations in app route files.");
    process.exit(0);
  }

  console.log(
    `\n⚠ ${violations.length} route file(s) with faux in-body page headers:\n`,
  );
  for (const v of violations) {
    console.log(`  ${v.file}`);
    console.log(`    → ${v.reason}\n`);
  }
  console.log(
    "Fix: wrap header controls in <PageHeader> (features/shell/components/header/PageHeader.tsx).\n" +
      "     Use HeaderStructured / AgentHeader pattern — one icon max on each edge of the center zone.\n" +
      "     Body content gets paddingTop: var(--shell-header-h).\n",
  );

  process.exit(strict ? 1 : 0);
}

main();
