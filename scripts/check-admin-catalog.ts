#!/usr/bin/env tsx
/**
 * check-admin-catalog.ts
 *
 * Ensures every page under app/(admin)/administration appears in the admin
 * dashboard catalog (features/admin/constants/admin-categories.ts).
 *
 *   pnpm check:admin-catalog           warn (yellow), exit 0
 *   pnpm check:admin-catalog --strict  fail on any gap, exit 1
 *
 * Also cross-checks the route scanner against an independent page-file walk.
 */

import { checkAdminRouteCatalog } from "../features/admin/utils/admin-route-catalog";

const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function parseArgs(): { strict: boolean } {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log("Usage: check-admin-catalog [--strict]");
    process.exit(0);
  }
  return { strict: process.argv.includes("--strict") };
}

function warnBlock(title: string, items: string[]) {
  if (items.length === 0) return;
  console.log("");
  console.log(`${YELLOW}${BOLD}⚠ ${title} (${items.length})${RESET}`);
  for (const item of items) {
    console.log(`${YELLOW}  • /administration/${item}${RESET}`);
  }
}

function main() {
  const { strict } = parseArgs();
  const result = checkAdminRouteCatalog();

  const issueCount =
    result.missingStatic.length +
    result.missingDynamicParents.length +
    result.staleCatalogLinks.length +
    result.scannerDrift.length;

  console.log("");
  console.log(`${BOLD}Admin dashboard catalog check${RESET}`);
  console.log(
    `${DIM}  ${result.discoveredRoutes.length} routes discovered · ${result.catalogPaths.length} catalog entries${RESET}`,
  );

  warnBlock(
    "Static routes missing from admin dashboard — add to admin-categories.ts",
    result.missingStatic,
  );

  warnBlock(
    "Dynamic routes whose list parent is not cataloged — add the parent route",
    result.missingDynamicParents,
  );

  if (result.staleCatalogLinks.length > 0) {
    console.log("");
    console.log(
      `${YELLOW}${BOLD}⚠ Stale catalog links (no page file) (${result.staleCatalogLinks.length})${RESET}`,
    );
    for (const link of result.staleCatalogLinks) {
      console.log(`${YELLOW}  • /administration/${link}${RESET}`);
    }
  }

  if (result.scannerDrift.length > 0) {
    console.log("");
    console.log(
      `${RED}${BOLD}✗ Route scanner drift — scanner vs page-file walk disagree (${result.scannerDrift.length})${RESET}`,
    );
    for (const route of result.scannerDrift) {
      console.log(`${RED}  • ${route}${RESET}`);
    }
  }

  console.log("");

  if (issueCount === 0) {
    console.log(`${GREEN}${BOLD}✓ Admin catalog is complete.${RESET}`);
    console.log("");
    process.exit(0);
  }

  if (strict) {
    console.log(
      `${RED}${BOLD}✗ Admin catalog check failed (${issueCount} issue${issueCount === 1 ? "" : "s"}).${RESET}`,
    );
    console.log(
      `${DIM}  Fix admin-categories.ts, then re-run: pnpm check:admin-catalog${RESET}`,
    );
    console.log("");
    process.exit(1);
  }

  console.log(
    `${YELLOW}${BOLD}⚠ Admin catalog has ${issueCount} gap${issueCount === 1 ? "" : "s"} — listed above.${RESET}`,
  );
  console.log(
    `${DIM}  Non-blocking for release. Use --strict to fail CI.${RESET}`,
  );
  console.log("");
  process.exit(0);
}

main();
