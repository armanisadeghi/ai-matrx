#!/usr/bin/env tsx
/**
 * Guards the first routable level of each active route family. A module root
 * must own canonical metadata, and non-system routes must be registered for a
 * curated favicon. Deeper pages may inherit that identity or override it.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { faviconRouteData } from "../constants/favicon-route-data";

const strict = process.argv.includes("--strict");
const root = process.cwd();

interface RouteFamily {
  directory: string;
  urlPrefix: string;
  systemFamily: boolean;
}

interface Finding {
  route: string;
  file: string;
  reason: string;
}

const families: RouteFamily[] = [
  { directory: "app/(core)", urlPrefix: "", systemFamily: false },
  { directory: "app/(public)", urlPrefix: "", systemFamily: false },
  {
    directory: "app/(admin)/administration",
    urlPrefix: "/administration",
    systemFamily: true,
  },
];

const registeredRoutes = new Set(
  faviconRouteData.filter((entry) => entry.favicon).map((entry) => entry.href),
);

const canonicalHelper =
  /\b(?:createRouteMetadata|createDynamicRouteMetadata|getRouteFavicon|createCustomFaviconMetadata|generateMetadata)\b/;
const importedMetadata =
  /export\s+const\s+metadata\s*=\s*[A-Za-z_$][\w$]*Metadata\b/;
const metadataExport =
  /export\s+(?:const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)\b/;

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function routeDirectories(family: RouteFamily): string[] {
  const absolute = join(root, family.directory);
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .filter((entry) => existsSync(join(absolute, entry.name, "page.tsx")))
    .map((entry) => entry.name)
    .sort();
}

const findings: Finding[] = [];

const routesByLetter = new Map<string, string[]>();
const seenRegisteredRoutes = new Set<string>();
for (const entry of faviconRouteData) {
  if (seenRegisteredRoutes.has(entry.href)) {
    findings.push({
      route: entry.href,
      file: "constants/favicon-route-data.ts",
      reason: "route has more than one favicon registry entry",
    });
  }
  seenRegisteredRoutes.add(entry.href);

  const letter = entry.favicon?.letter?.toUpperCase();
  if (!letter || entry.href === "/rag" || entry.href.startsWith("/legacy/")) continue;
  routesByLetter.set(letter, [...(routesByLetter.get(letter) ?? []), entry.href]);
}

for (const [letter, routes] of routesByLetter) {
  if (routes.length < 2) continue;
  findings.push({
    route: routes.join(", "),
    file: "constants/favicon-route-data.ts",
    reason: `favicon letter ${letter} is assigned to multiple routes`,
  });
}

for (const family of families) {
  for (const segment of routeDirectories(family)) {
    const directory = `${family.directory}/${segment}`;
    const page = `${directory}/page.tsx`;
    const layout = `${directory}/layout.tsx`;
    const boundary = existsSync(join(root, layout)) ? layout : page;
    const sources = [page, ...(existsSync(join(root, layout)) ? [layout] : [])];
    const source = sources.map(read).join("\n");
    const route = `${family.urlPrefix}/${segment}`;

    if (!metadataExport.test(source)) {
      findings.push({
        route,
        file: boundary,
        reason: "no metadata boundary at the module root",
      });
      continue;
    }

    if (!canonicalHelper.test(source) && !importedMetadata.test(source)) {
      findings.push({
        route,
        file: boundary,
        reason:
          "metadata bypasses the canonical route helpers, so favicon/social defaults can drift",
      });
    }

    if (family.systemFamily) {
      if (!/\bletter\s*:/.test(source)) {
        findings.push({
          route,
          file: boundary,
          reason:
            "administration route has no explicit, route-specific favicon letter",
        });
      }
    } else if (!registeredRoutes.has(route)) {
      findings.push({
        route,
        file: boundary,
        reason: "route is missing from constants/favicon-route-data.ts",
      });
    } else {
      const registeredLetter = faviconRouteData
        .find((entry) => entry.href === route)
        ?.favicon?.letter?.toUpperCase();
      const explicitLetter = source.match(/\bletter\s*:\s*["']([^"']+)["']/)?.[1];
      if (
        registeredLetter &&
        explicitLetter &&
        explicitLetter.toUpperCase() !== registeredLetter
      ) {
        findings.push({
          route,
          file: boundary,
          reason: `root metadata overrides registry letter ${registeredLetter} with ${explicitLetter}`,
        });
      }
    }
  }
}

if (findings.length === 0) {
  console.log(
    "check-route-metadata: OK — every active module root has canonical metadata and favicon identity.",
  );
  process.exit(0);
}

console.error("ROUTE METADATA GAPS");
console.error(`${findings.length} module-root violation(s):`);
for (const finding of findings) {
  console.error(`  • ${finding.route} — ${finding.reason}`);
  console.error(`    ${finding.file}`);
}
console.error(
  "Fix with createRouteMetadata/createDynamicRouteMetadata and the shared favicon registry.",
);
process.exit(strict ? 1 : 0);
