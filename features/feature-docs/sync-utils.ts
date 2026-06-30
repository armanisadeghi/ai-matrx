/**
 * Shared repo ↔ DB helpers for feature doc sync and the admin viewer.
 */

import { createHash } from "node:crypto";
import {
  classifyFeatureDocPath,
  FEATURE_DOC_GLOBS,
} from "@/features/feature-docs/constants";

export {
  classifyFeatureDocPath,
  FEATURE_DOC_CODEBASE_GLOBS,
  FEATURE_DOC_DOCS_GLOBS,
  FEATURE_DOC_DOT_DIR_GLOBS,
  FEATURE_DOC_DOT_DIRS,
  FEATURE_DOC_GLOBS,
  pathMatchesZone,
} from "@/features/feature-docs/constants";

export interface ParsedFeatureDoc {
  /** Raw file bytes as UTF-8 (includes frontmatter when present). */
  content: string;
  title: string;
  slug: string;
  area: string | null;
  /** Extra frontmatter keys (slug/title/area stripped). */
  metadata: Record<string, string>;
}

export function md5(content: string): string {
  return createHash("md5").update(content, "utf8").digest("hex");
}

export function kebab(value: string): string {
  return value
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function titleFromMarkdown(content: string): string | null {
  const body = stripFrontmatter(content);
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;
  return content.slice(end + 4).replace(/^\n/, "");
}

/** Minimal YAML frontmatter parser (key: value lines only). */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }
  const raw = content.slice(4, end);
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (m) frontmatter[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const body = content.slice(end + 4).replace(/^\n/, "");
  return { frontmatter, body: content };
}

export function deriveArea(
  repoPath: string,
  frontmatter: Record<string, string>,
): string | null {
  if (frontmatter.area) return frontmatter.area;
  const { zone, dotDir } = classifyFeatureDocPath(repoPath);
  if (zone === "docs") return "docs";
  if (zone === "dotdir" && dotDir) return dotDir;
  const parts = repoPath.split("/");
  if (parts.length >= 2) return parts[0] ?? null;
  return null;
}

export function deriveSlug(
  repoPath: string,
  frontmatter: Record<string, string>,
): string {
  if (frontmatter.slug) return kebab(frontmatter.slug);
  const base = repoPath.split("/").pop() ?? repoPath;
  return kebab(base);
}

export function deriveTitle(
  repoPath: string,
  content: string,
  frontmatter: Record<string, string>,
): string {
  if (frontmatter.title) return frontmatter.title;
  const fromHeading = titleFromMarkdown(content);
  if (fromHeading) return fromHeading;
  const base = repoPath.split("/").pop() ?? repoPath;
  return base.replace(/\.md$/i, "");
}

export function parseFeatureDocFile(
  repoPath: string,
  content: string,
): ParsedFeatureDoc {
  const { frontmatter } = parseFrontmatter(content);
  const reserved = new Set(["slug", "title", "area"]);
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!reserved.has(k)) metadata[k] = v;
  }
  return {
    content,
    slug: deriveSlug(repoPath, frontmatter),
    title: deriveTitle(repoPath, content, frontmatter),
    area: deriveArea(repoPath, frontmatter),
    metadata,
  };
}

export function featureDocViewHref(repoPath: string): string {
  const clean = repoPath.replace(/^\/+/, "");
  return `/administration/feature-docs/view/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
