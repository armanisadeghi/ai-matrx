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
import { join, resolve } from "node:path";

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
  return source.includes("permanentRedirect(") && !/return\s*[(<]/.test(source);
}

function importedMarketingModulePaths(source: string): string[] {
  const paths: string[] = [];
  const importRe = /import\s+[^;]*?\s+from\s+["']([^"']+)["']/gs;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith("@/features/marketing/")) {
      paths.push(specifier.replace("@/", ""));
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

  return importedMarketingModulePaths(pageSource).some((modulePath) => {
    const file = resolveModuleFile(modulePath);
    if (!file) return false;
    return hasHeaderOffset(readFileSync(file, "utf8"));
  });
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
