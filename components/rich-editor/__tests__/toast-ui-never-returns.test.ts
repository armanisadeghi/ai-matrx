/**
 * TOAST UI NEVER RETURNS — anywhere in the app.
 *
 * Arman, 2026-09-27: Toast UI is "the horrible plugin we said we'd get rid of".
 * Every editor that mounted it (notes, the full-screen markdown editor, the
 * official ContentEditor, the HTML page editor and its tabs) now writes in THE
 * ONE EDITOR (components/rich-editor), and `@toast-ui/*` is out of package.json.
 *
 * Two halves, each able to go red on its own:
 *   1. No source file imports `@toast-ui/*` (or the deleted TuiEditorContent
 *      wrapper) — a static scan of import / dynamic-import / require specifiers
 *      over every source tree.
 *   2. package.json declares no `@toast-ui/*` dependency.
 *
 * The checkout is scanned through `git ls-files` (tracked source only — untracked
 * scratch copies are nobody's code). `TOAST_UI_GUARD_ROOT` points the scan at
 * another tree, walked from disk (used to prove the guard red against a scratch
 * copy of the pre-removal files — never the shared checkout).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.env.TOAST_UI_GUARD_ROOT ?? join(__dirname, "..", "..", "..");
const SKIP = new Set(["node_modules", ".git", ".next", ".wt", "tmp", "coverage", "dist", "out"]);
const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'][^"']*(?:@toast-ui\/|chat-markdown\/tui\/|TuiEditorContent)[^"']*["']/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP.has(name) || name.startsWith(".next")) continue;
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe("Toast UI never returns", () => {
  it("no source file imports @toast-ui or the TuiEditorContent wrapper", () => {
    const files = (
      process.env.TOAST_UI_GUARD_ROOT
        ? sourceFiles(ROOT)
        : execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
            .split("\0")
            .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(file))
            .map((file) => join(ROOT, file))
    ).filter((file) => !file.endsWith("toast-ui-never-returns.test.ts"));
    expect(files.length).toBeGreaterThan(50); // the scan really read a source tree
    const offenders = files
      .filter((file) => {
        let text: string;
        try {
          text = readFileSync(file, "utf8");
        } catch {
          return false; // tracked but deleted in the working tree
        }
        return text.split("\n").some((line) => IMPORT.test(line));
      })
      .map((file) => relative(ROOT, file))
      .sort();
    expect(offenders).toEqual([]);
  });

  it("package.json declares no @toast-ui dependency", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const declared = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((field) =>
      Object.keys(pkg[field] ?? {}).filter((name) => name.startsWith("@toast-ui/")),
    );
    expect(declared).toEqual([]);
  });
});
