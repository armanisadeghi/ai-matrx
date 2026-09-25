"use client";

// The document-properties hook: a document's front matter (YAML `---` or
// TOML `+++` at the top) as properties, for any properties panel. The
// renderer hides the same block, so what is metadata never shows as text.

import { extractFrontmatter, type DocumentPropertiesResult } from "./frontmatter";

/** The React Compiler memoizes this per `source`. */
export function useDocumentProperties(source: string): DocumentPropertiesResult {
  return extractFrontmatter(source);
}
