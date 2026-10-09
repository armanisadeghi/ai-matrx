// Census: every `[brandId]` client-workspace page must clear the shell's
// glass header band — either via `<PageHeader>` (the header owns the
// spacing) or, for pages that render their own scroll body, an explicit
// `--shell-header-h` top offset on that body (see
// `.claude/skills/core-route-headers/SKILL.md` failure class 4).
//
// A page that skips both renders its first interactive controls UNDER the
// header glass: clicks there are swallowed by the shell, not the page
// (Cursor Bugbot round 12, PR 228, review comment 4041503958 — the
// `analytics` route shipped exactly this, wrapping `BrandAnalyticsWorkspace`
// in a bare `p-3` scroller with no offset).
//
// The check is a two-level static scan: the route's `page.tsx`, plus every
// `@/features/marketing/**` module it imports directly — that second level
// is where sibling routes (`inbox`, `locations`, `websites`, `socials`)
// actually carry the offset, one layer down in their workspace component.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { aliasTarget } from "@/scripts/lib/source-roots.cjs";

const BRAND_ROUTE_DIR = resolve(
  process.cwd(),
  "app/(core)/marketing/[brandId]",
);

const HEADER_OFFSET_MARKERS = ["<PageHeader", "shell-header-h"] as const;

function hasHeaderOffset(source: string): boolean {
  return HEADER_OFFSET_MARKERS.some((marker) => source.includes(marker));
}

/** A page whose entire body is a redirect never renders content to offset. */
function isRedirectOnlyPage(source: string): boolean {
  return /\b(permanentRedirect|redirect)\(/.test(source) && !/return\s*[(<]/.test(source);
}

function importedMarketingModulePaths(source: string, fromFile?: string): string[] {
  const paths: string[] = [];
  const importRe = /import\s+[^;]*?\s+from\s+["']([^"']+)["']/gs;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source)) !== null) {
    const spec = match[1];
    // Relative imports (`./EmailFrontDoor`) resolve against the importing file:
    // a workspace split into sibling modules still carries its offset somewhere.
    if (fromFile && spec.startsWith(".")) {
      const abs = resolve(dirname(fromFile), spec);
      const rel = abs.slice(process.cwd().length + 1);
      if (rel.startsWith("features/marketing/")) paths.push(rel);
      continue;
    }
    const target = aliasTarget(spec);
    if (target?.startsWith("features/marketing/")) {
      paths.push(target);
    }
  }
  return paths;
}

function resolveModuleFile(relativePath: string): string | null {
  for (const ext of [".tsx", ".ts"]) {
    const candidate = resolve(process.cwd(), `${relativePath}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Direct children of `[brandId]` that ship their own `page.tsx`. */
function brandWorkspaceSegments(): string[] {
  return readdirSync(BRAND_ROUTE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.startsWith("["))
    .filter((entry) => existsSync(join(BRAND_ROUTE_DIR, entry.name, "page.tsx")))
    .map((entry) => entry.name)
    .sort();
}

/**
 * True when the page itself, or any `@/features/marketing/**` module it
 * imports directly, carries a header-clearing marker.
 */
function pageClearsHeader(segment: string): boolean {
  const pagePath = join(BRAND_ROUTE_DIR, segment, "page.tsx");
  const pageSource = readFileSync(pagePath, "utf8");

  if (isRedirectOnlyPage(pageSource)) return true;
  if (hasHeaderOffset(pageSource)) return true;

  // Walk the page's marketing imports up to three layers deep: page ->
  // brand-scoped wrapper -> front-door page that owns the scroll body.
  const seen = new Set<string>();
  const walk = (source: string, fromFile: string | undefined, depth: number): boolean =>
    importedMarketingModulePaths(source, fromFile).some((modulePath) => {
      const file = resolveModuleFile(modulePath);
      if (!file || seen.has(file)) return false;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      if (hasHeaderOffset(text)) return true;
      return depth < 3 && walk(text, file, depth + 1);
    });
  return walk(pageSource, undefined, 1);
}

describe("marketing [brandId] pages clear the shell header band", () => {
  const segments = brandWorkspaceSegments();

  it("found the brand workspace's routes on disk", () => {
    // A guard that silently checks zero routes proves nothing.
    expect(segments.length).toBeGreaterThan(5);
  });

  it.each(segments)("/marketing/[brandId]/%s reserves the header offset", (segment) => {
    expect(pageClearsHeader(segment)).toBe(true);
  });
});
