/**
 * Text LEAVING its home (a note, a task, a file, a template, the rulebook, a
 * webpage, a Google Doc, an email, the clipboard, print) never carries the
 * internal `<artifact …>` envelope. RC-B6 round 2: Save to Notes stored the raw
 * tag while Create Task stripped it — one writer used the shared projection,
 * the others read `ctx.content` directly. Every handler hands `contentForDestination(ctx)`
 * (the one projection) to a destination; `ctx.content` itself goes only where
 * the envelope is the point (extracting the kind blocks) or where the text
 * stays home (edit-in-place, compare, read-aloud of what is shown).
 */
import * as fs from "fs";
import * as path from "path";
import { contentForDestination } from "../utils";

const HANDLERS = path.join(__dirname, "../handlers");

/** file → why raw ctx.content may be handed on there. */
const RAW_ALLOWED: Record<string, string> = {
  "capture.ts:text": "save-shape-instance EXTRACTS the kind blocks — it needs the envelopes",
};

const OUTBOUND = [
  /\b(content|initialContent|text|selection|original|current):\s*ctx\.content\b/g,
  /\(\s*ctx\.content\s*,/g,
  /\[\s*ctx\.content\s*\]/g,
  /\b(copyText|copyToClipboard|markdownToHtml|cleanMarkdown|printMarkdownContent|toPlainText)\(\s*ctx\.content\b/g,
];

describe("outbound content", () => {
  it("unwraps envelopes to their body", () => {
    const ctx = {
      content: 'Intro\n\n<artifact type="table" id="t1" version="1" title="Table 1">\n| a | b |\n|---|---|\n| 1 | 2 |\n</artifact>\n',
    } as never;
    const out = contentForDestination(ctx);
    expect(out).not.toContain("<artifact");
    expect(out).toContain("| a | b |");
  });

  it("no handler hands raw ctx.content to a destination", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(HANDLERS).filter((f) => f.endsWith(".ts"))) {
      const src = fs.readFileSync(path.join(HANDLERS, file), "utf8");
      for (const re of OUTBOUND) {
        for (const m of src.matchAll(re)) {
          const key = `${file}:${m[1] ?? "arg"}`;
          if (RAW_ALLOWED[key]) continue;
          // Home-bound writers (edit in place, compare against what is shown).
          if (/^(edit|preparedEdit|fullscreen-editor|compare|listen)\.ts$/.test(file)) continue;
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${file}:${line} ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
