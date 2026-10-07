// GUARD: every rich-content surface copies through THE one copy module
// (`copyRichContent` in components/agent-copy/copy-commands.ts, which writes through kit's `copyRich` —
// Copy = formatted + markdown, Copy markdown, Copy text). A raw
// `navigator.clipboard.write*` in a rich-content host is a second copy that
// gives the person one flavor and no choice (Arman, 2026-10-04).
//
// Not every clipboard write is rich text — an id, a link, raw code, JSON — but none of those is raw
// either: they go through `copyToClipboard` (@/lib/clipboard/copy) / kit `copyText`. The allow-list
// is empty; a new raw write in a host directory fails until it is routed (or listed WITH the reason).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

/** Where rich content is shown or edited. */
const HOST_DIRS = [
  "features/rich-document",
  "features/notes",
  "features/flashcards",
  "components/selection-toolbar",
  "components/rich-editor",
  "components/markdown-studio",
  "components/official/content-editor",
  "components/mardown-display/chat-markdown",
  "packages/chat/src/agents/components/messages-display",
  "packages/chat/src/tool-call-visualization",
  "features/chat-tool-renderers",
];

/** Raw writes that are NOT rich text — file → why. */
const RAW_ALLOWED: Record<string, string> = {};

const RAW_WRITE = /navigator\.clipboard\s*\??\.\s*(?:write|writeText)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Files under `root`'s host dirs with a raw clipboard write that is not allowed. */
export function rawRichCopies(root: string, dirs: readonly string[], allowed: Record<string, string>): string[] {
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (allowed[rel]) continue;
      if (RAW_WRITE.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
    }
  }
  return offenders.sort();
}

describe("rich-content copy goes through the one module", () => {
  test("no rich-content host writes the clipboard raw", () => {
    const offenders = rawRichCopies(ROOT, HOST_DIRS, RAW_ALLOWED);
    if (offenders.length) {
      throw new Error(
        "A rich-content surface writes the clipboard outside the one copy module. Route it through " +
          "copyRichContent (components/agent-copy/copy-commands.ts) — or, if it copies an id, a link, " +
          `raw code or JSON, list it in RAW_ALLOWED with the reason:\n  ${offenders.join("\n  ")}`,
      );
    }
  });

  test("every allow-list entry still exists and still writes raw (no stale exemptions)", () => {
    const stale = Object.keys(RAW_ALLOWED).filter((rel) => {
      const file = path.join(ROOT, rel);
      return !fs.existsSync(file) || !RAW_WRITE.test(fs.readFileSync(file, "utf8"));
    });
    expect(stale).toEqual([]);
  });

  test("the detector goes red on a planted raw copy and green once routed (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rich-copy-census-"));
    const host = path.join(tmp, "features/notes/components");
    fs.mkdirSync(host, { recursive: true });
    const planted = path.join(host, "NoteCopy.tsx");
    fs.writeFileSync(planted, "export const c = (s: string) => navigator.clipboard.writeText(s);\n");
    expect(rawRichCopies(tmp, ["features/notes"], {})).toEqual(["features/notes/components/NoteCopy.tsx"]);
    fs.writeFileSync(planted, 'import { copyRichContent } from "x";\nexport const c = (s: string) => copyRichContent(s);\n');
    expect(rawRichCopies(tmp, ["features/notes"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
