/**
 * GUARD: a content.document the UI creates can be archived from the UI.
 *
 * THE FINDING (verifier, 2026-09-26): a document made from /markdown-studio
 * (Annotate → "Create a document from this text") looked like it had no
 * archive anywhere. The door exists — once created, the document loads into
 * the studio and "Archive document" is the first item of the header's More
 * actions (ArchiveRecordDialog, token "document" → content.document, restored
 * from /trash as a "Markdown document"); proven by clicks for test@test.com and
 * admin@admin.com. This guard keeps that door: every file that CREATES a
 * content.document must be a surface whose created record then loads where the
 * archive action lives — today, only the studio. A new creator elsewhere fails
 * here until it ships its own archive path (then add it below).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
/** Files that create a content.document, and where its archive action lives. */
const CREATORS_WITH_ARCHIVE: Record<string, string> = {
  "components/markdown-studio/AnnotateView.tsx": "components/markdown-studio/MarkdownStudio.tsx",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

it("every content.document creator has an archive path", () => {
  const creators = ["app", "components", "features", "lib"]
    .flatMap((d) => walk(join(ROOT, d)))
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return /from\s+["']@\/features\/rich-document\/annotations\/documentSource["']/.test(src) && /\bcreateDocument\s*\(/.test(src);
    })
    .map((f) => relative(ROOT, f));
  expect(creators.sort()).toEqual(Object.keys(CREATORS_WITH_ARCHIVE).sort());

  for (const host of Object.values(CREATORS_WITH_ARCHIVE)) {
    const src = readFileSync(join(ROOT, host), "utf8");
    expect(src).toMatch(/label:\s*"Archive document"/);
    expect(src).toMatch(/<ArchiveRecordDialog[\s\S]*?token="document"/);
  }
});
