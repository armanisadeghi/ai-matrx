/**
 * Canonical zones and glob roots for feature-doc sync + admin browsing.
 * Dot-directories and docs/ are kept separate from the main codebase table.
 */

/** Known tooling / agent config directories at repo root (explicit — never inferred). */
export const FEATURE_DOC_DOT_DIRS = [
  ".agent",
  ".arman",
  ".claude",
  ".codex",
  ".cursor",
  ".matrx",
  ".vscode",
] as const;

export type FeatureDocDotDir = (typeof FEATURE_DOC_DOT_DIRS)[number];

export type FeatureDocZone = "codebase" | "docs" | "dotdir";

/** URL slug under /administration/feature-docs/dotdirs/[slug] (no leading dot). */
export const DOT_DIR_ROUTE_SLUG: Record<string, FeatureDocDotDir> =
  Object.fromEntries(
    FEATURE_DOC_DOT_DIRS.map((d) => [d.slice(1), d]),
  ) as Record<string, FeatureDocDotDir>;

export function dotDirFromRouteSlug(slug: string): FeatureDocDotDir | null {
  return DOT_DIR_ROUTE_SLUG[slug] ?? null;
}

export function dotDirRouteSlug(dir: FeatureDocDotDir): string {
  return dir.slice(1);
}

/** Main repo markdown — excludes docs/ and all dot-directories. */
export const FEATURE_DOC_CODEBASE_GLOBS = [
  "./*.md",
  "app/**/*.md",
  "features/**/*.md",
  "components/**/*.md",
  "lib/**/*.md",
  "hooks/**/*.md",
  "utils/**/*.md",
  "providers/**/*.md",
  "types/**/*.md",
  "constants/**/*.md",
  "scripts/**/*.md",
  "migrations/**/*.md",
  "styles/**/*.md",
] as const;

export const FEATURE_DOC_DOCS_GLOBS = ["docs/**/*.md"] as const;

export const FEATURE_DOC_DOT_DIR_GLOBS = FEATURE_DOC_DOT_DIRS.map(
  (d) => `${d}/**/*.md`,
) as `${FeatureDocDotDir}/**/*.md`[];

/** Full sync set — union of all zones. */
export const FEATURE_DOC_GLOBS = [
  ...FEATURE_DOC_CODEBASE_GLOBS,
  ...FEATURE_DOC_DOCS_GLOBS,
  ...FEATURE_DOC_DOT_DIR_GLOBS,
] as const;

export interface FeatureDocPathClassification {
  zone: FeatureDocZone;
  dotDir?: FeatureDocDotDir;
}

export function classifyFeatureDocPath(
  path: string,
): FeatureDocPathClassification {
  const normalized = path.replace(/^\/+/, "");
  if (normalized === "docs" || normalized.startsWith("docs/")) {
    return { zone: "docs" };
  }
  for (const dotDir of FEATURE_DOC_DOT_DIRS) {
    if (normalized === dotDir || normalized.startsWith(`${dotDir}/`)) {
      return { zone: "dotdir", dotDir };
    }
  }
  return { zone: "codebase" };
}

export function pathMatchesZone(
  path: string,
  zone: FeatureDocZone,
  dotDir?: FeatureDocDotDir,
): boolean {
  const c = classifyFeatureDocPath(path);
  if (c.zone !== zone) return false;
  if (zone === "dotdir") return c.dotDir === dotDir;
  return true;
}

export const FEATURE_DOC_ZONE_LABELS: Record<FeatureDocZone, string> = {
  codebase: "Codebase",
  docs: "Docs",
  dotdir: "Tooling dirs",
};
