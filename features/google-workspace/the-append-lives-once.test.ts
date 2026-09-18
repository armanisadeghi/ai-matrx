/**
 * 🚨 THERE IS ONE PLACE THAT APPENDS TO A GOOGLE DOC, AND IT IS THE RECORD'S OWN
 * DETAIL PANEL.
 *
 * THE DEFECT (VERIFY-U-W1-U-W2 N2). `features/google-workspace/documents/` shipped
 * the canonical composer — it shows the exact block before anything reaches
 * Google and prepends the dated heading `google.docs.append_heading` asks for —
 * while `GoogleWorkspaceReviewWorkspace.tsx` still carried a plain "Text to
 * append" box that called the SAME `appendGoogleDocument` with the raw textarea
 * value: no preview, no heading, no Record, no health strip. Two implementations
 * of one capability, disagreeing about the bytes that land in a customer's
 * document — and the bespoke one was the only Doc surface a person could reach.
 *
 * So the class is guarded, not the instance: the append call is reachable from
 * the Record's own feature directory and nowhere else. A new bespoke composer on
 * any surface fails HERE.
 *
 * The detector is a pure function over (path, source) pairs so it can be proven
 * to fail in both directions — a guard that cannot fail is worse than none — and
 * is then run over the real tree.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** The ONE home of the Doc append. */
const CANONICAL_PREFIX = "features/google-workspace/documents/";

/** Where the service function is DECLARED. Declaring it is not a second surface. */
const DECLARATION = "features/google-workspace/service.ts";

const APPEND = "appendGoogleDocument";

/** A test naming the symbol (to mock it, or to be this guard) is not a surface. */
function isTestFile(path: string): boolean {
  return (
    /\.test\.[cm]?tsx?$/.test(path) ||
    path.includes("__tests__/") ||
    path.includes("__mocks__/")
  );
}

export function appendOffenders(
  files: readonly { path: string; source: string }[],
): string[] {
  return files
    .filter((file) => file.source.includes(APPEND))
    .filter((file) => !file.path.startsWith(CANONICAL_PREFIX))
    .filter((file) => file.path !== DECLARATION)
    .filter((file) => !isTestFile(file.path))
    .map((file) => file.path)
    .sort();
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
]);

function walk(root: string, dir: string, out: { path: string; source: string }[]) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      walk(root, full, out);
      continue;
    }
    if (!/\.[cm]?tsx?$/.test(entry)) continue;
    out.push({
      path: relative(root, full).split(sep).join("/"),
      source: readFileSync(full, "utf8"),
    });
  }
}

describe("the Doc append lives once", () => {
  it("names a bespoke composer on any other surface", () => {
    // The 2026-09-18 shape of the defect, verbatim in spirit.
    expect(
      appendOffenders([
        {
          path: "features/google-workspace/GoogleWorkspaceReviewWorkspace.tsx",
          source: "const outcome = await appendGoogleDocument(id, ref, documentAppend);",
        },
      ]),
    ).toEqual(["features/google-workspace/GoogleWorkspaceReviewWorkspace.tsx"]);
  });

  it("accepts the canonical composer and the declaration, and nothing else", () => {
    expect(
      appendOffenders([
        {
          path: "features/google-workspace/documents/GoogleDocumentPanel.tsx",
          source: "await appendGoogleDocument(connectionId, row.external_id, block);",
        },
        {
          path: DECLARATION,
          source: "export async function appendGoogleDocument(",
        },
        {
          path: "features/google-workspace/write-gate.test.ts",
          source: "await appendGoogleDocument('c1', 'doc-1', 'more');",
        },
        {
          path: "features/google-workspace/GoogleWorkspaceReviewWorkspace.tsx",
          source: "// nothing appends here any more",
        },
      ]),
    ).toEqual([]);
  });

  it("holds over the whole repository", () => {
    const root = process.cwd();
    const files: { path: string; source: string }[] = [];
    for (const top of ["features", "app", "components", "lib", "hooks", "utils"]) {
      try {
        statSync(join(root, top));
      } catch {
        continue;
      }
      walk(root, join(root, top), files);
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(appendOffenders(files)).toEqual([]);
  });
});
