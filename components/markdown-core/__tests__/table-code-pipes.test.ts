/**
 * One rule for `\|` inside a code span in a table cell (verify-RC-B4 R4-3).
 * GFM (spec example 200, and GitHub): the table row is split first, then the
 * `\|` that kept the pipe inside the cell is removed — even inside a code span —
 * so `` `err\|warn` `` shows `err|warn`. micromark keeps the backslash in code;
 * the editor's lexer (marked) removes it. The core's GFM presets now remove it,
 * so the chat answer, the Preview and Visual all show the same cell.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkTableCodePipes from "../syntax/remark-table-code-pipes";
import { MARKDOWN_PRESETS } from "../markdown-core-presets";

type Node = { type: string; value?: string; children?: Node[] };

function codeValues(markdown: string): string[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkTableCodePipes);
  const tree = processor.runSync(processor.parse(markdown)) as Node;
  const out: string[] = [];
  const visit = (node: Node) => {
    if (node.type === "inlineCode" && node.value !== undefined) out.push(node.value);
    node.children?.forEach(visit);
  };
  visit(tree);
  return out;
}

describe("a code span's \\| in a table cell shows as |, as GFM says", () => {
  it("inside a table cell", () => {
    expect(codeValues("| Cmd | Note |\n|---|---|\n| `grep err\\|warn` | log filter |")).toEqual(["grep err|warn"]);
  });

  it("outside a table the backslash stays (CommonMark: no escapes in code)", () => {
    expect(codeValues("Run `grep err\\|warn` on the log.")).toEqual(["grep err\\|warn"]);
  });

  it("every GFM preset of the one core carries the rule", () => {
    for (const [name, preset] of Object.entries(MARKDOWN_PRESETS)) {
      const remark = preset.remark ?? [];
      const hasGfm = remark.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === remarkGfm);
      if (!hasGfm) continue;
      expect([name, remark.includes(remarkTableCodePipes)]).toEqual([name, true]);
    }
  });
});
