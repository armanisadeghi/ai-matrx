/**
 * Every editor feature, judged on the bytes it writes.
 *
 * SUT: the visual adapter + core/commands.ts verbs + the pure feature modules
 * (tables, callouts, page breaks, footnotes, task lists, moves, islands, undo,
 * find & replace, outline, metrics, variables, paste conversion). Each
 * expected value is the literal markdown a person would write by hand.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
} from "../core/visual-document";
import { planSave } from "../core/save-plan";
import {
  fenceFromParagraph,
  insertCodeBlock,
  insertFootnote,
  insertKind,
  insertMathBlock,
  insertPageBreak,
  insertVariable,
  moveBlock,
  replaceIslandRaw,
  setCallout,
  setColumnAlign,
  toggleTaskChecked,
  toggleTaskList,
} from "../core/commands";
import { findMatches, replaceMatches } from "../core/find-replace";
import { outlineOf } from "../core/outline";
import { measureText } from "../core/text-metrics";
import { classifyVariable } from "../core/variables";
import { htmlToMarkdown } from "../core/html-to-markdown";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function open(text: string) {
  const { json, plan } = buildVisualDocument(text, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  const baseline = captureBaseline(editor.state.doc, plan);
  return { editor, save: () => serializeVisualDocument(editor.state.doc, baseline) };
}

function find(doc: PMNode, predicate: (node: PMNode) => boolean): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (predicate(node)) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === -1) throw new Error("node not found");
  return found;
}

function cursorAtEndOf(editor: Editor, needle: string): void {
  const pos = find(editor.state.doc, (node) => node.isTextblock && node.textContent.includes(needle));
  const node = editor.state.doc.nodeAt(pos);
  editor.commands.setTextSelection(pos + 1 + (node?.content.size ?? 0));
}

const PICKUP_TABLE = `Weekly tote counts:

| Site     | Totes | Driver  |
|:---------|------:|---------|
| Alton    |     6 | Marisol |
| Barranca |     2 | Devin   |

Totals reconcile Friday.`;

describe("tables", () => {
  it("editing one cell rewrites only that row", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.isText === true && node.text === "Devin");
    editor.commands.command(({ tr }) => {
      tr.insertText(" R.", pos + 5);
      return true;
    });
    expect(save()).toBe(PICKUP_TABLE.replace("| Barranca |     2 | Devin   |", "| Barranca | 2 | Devin R. |"));
  });

  it("adding a row keeps every stored row byte-for-byte", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.isText === true && node.text === "Devin");
    editor.commands.setTextSelection(pos + 1);
    editor.commands.addRowAfter();
    expect(save()).toBe(PICKUP_TABLE.replace("| Barranca |     2 | Devin   |", "| Barranca |     2 | Devin   |\n|  |  |  |"));
  });

  it("changing a column's alignment rewrites only the delimiter row", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.type.name === "tableHeader" && node.textContent === "Driver");
    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)?.attrs, align: "center" });
      return true;
    });
    expect(save()).toBe(PICKUP_TABLE.replace("|:---------|------:|---------|", "| :--- | ---: | :---: |"));
  });

  it("aligning a column from inside a body cell rewrites only the delimiter row", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.isText === true && node.text === "Devin");
    editor.commands.setTextSelection(pos + 1);
    setColumnAlign(editor, "right");
    expect(save()).toBe(PICKUP_TABLE.replace("|:---------|------:|---------|", "| :--- | ---: | ---: |"));
  });

  it("deleting a column rewrites every row, and only the table", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.isText === true && node.text === "Devin");
    editor.commands.setTextSelection(pos + 1);
    editor.commands.deleteColumn();
    expect(save()).toBe(
      "Weekly tote counts:\n\n| Site | Totes |\n| :--- | ---: |\n| Alton | 6 |\n| Barranca | 2 |\n\nTotals reconcile Friday.",
    );
  });

  it("a pipe typed into a cell is escaped so the row keeps its columns", () => {
    const { editor, save } = open(PICKUP_TABLE);
    const pos = find(editor.state.doc, (node) => node.isText === true && node.text === "Marisol");
    editor.commands.command(({ tr }) => {
      tr.insertText(" | Devin", pos + 7);
      return true;
    });
    expect(save()).toContain("| Alton | 6 | Marisol \\| Devin |\n| Barranca |     2 | Devin   |");
  });
});

describe("callouts, checklists, page breaks, footnotes", () => {
  const CALLOUT = "> [!WARNING]\n> Sharps never ride with e-waste.\n\nNext stop: Main.";

  it("a GFM alert edits as prose and keeps its marker", () => {
    const { editor, save } = open(CALLOUT);
    cursorAtEndOf(editor, "Sharps never ride");
    editor.commands.insertContent(" Ever.");
    expect(save()).toBe(CALLOUT.replace("with e-waste.", "with e-waste. Ever."));
  });

  it("changing the callout type rewrites only its marker", () => {
    const { editor, save } = open(CALLOUT);
    cursorAtEndOf(editor, "Sharps never ride");
    setCallout(editor, "CAUTION");
    expect(save()).toBe(CALLOUT.replace("[!WARNING]", "[!CAUTION]"));
  });

  it("ticking a checklist item flips only its box", () => {
    const text = "- [ ] Call the Alton manager\n- [ ] Reserve the box truck";
    const { editor, save } = open(text);
    const pos = find(editor.state.doc, (node) => node.type.name === "listItem" && node.textContent.includes("Reserve"));
    toggleTaskChecked(editor, pos);
    expect(save()).toBe("- [ ] Call the Alton manager\n- [x] Reserve the box truck");
  });

  it("turning a bulleted list into a checklist writes GFM task boxes", () => {
    const text = "* Tires\n* Liftgate";
    const { editor, save } = open(text);
    cursorAtEndOf(editor, "Tires");
    toggleTaskList(editor);
    expect(save()).toBe("* [ ] Tires\n* [ ] Liftgate");
  });

  it("a page break is inserted in the print package's one grammar", () => {
    const text = "Page one ends here.";
    const { editor, save } = open(text);
    cursorAtEndOf(editor, "Page one");
    insertPageBreak(editor);
    expect(save()).toBe("Page one ends here.\n\n<!-- pagebreak -->");
  });

  it("a stored \\newpage line is held as a page break and written back untouched", () => {
    const text = "Before.\n\\newpage\nAfter.";
    const { editor, save } = open(text);
    cursorAtEndOf(editor, "After");
    editor.commands.insertContent(" More.");
    expect(save()).toBe("Before.\n\\newpage\nAfter. More.");
  });

  it("a footnote adds the reference at the cursor and its definition at the end", () => {
    const text = "Sharps follow county ordinance 4-12.";
    const { editor, save } = open(text);
    cursorAtEndOf(editor, "ordinance");
    insertFootnote(editor);
    editor.commands.insertContent("Section B covers sharps.");
    expect(save()).toBe("Sharps follow county ordinance 4-12.[^1]\n\n[^1]: Section B covers sharps.");
  });
});

describe("islands: inserted with exact bytes, edited only on purpose, undone as a unit", () => {
  const PROMPT = "Greet {{customer_name}}.\n\n```python\nprint('hi')\n```\n\nClose politely.";

  it("inserting code, math, a kind and a variable writes their markdown exactly", () => {
    const { editor, save } = open("Route notes.");
    cursorAtEndOf(editor, "Route notes");
    insertCodeBlock(editor, "sql");
    insertMathBlock(editor, "w \\le 4200");
    insertKind(editor, "checklist", { title: "Pre-trip", items: ["Tires"] });
    const written = save();
    expect(written).toBe(
      'Route notes.\n\n```sql\n\n```\n\n$$\nw \\le 4200\n$$\n\n{\n  "__kind": "checklist",\n  "title": "Pre-trip",\n  "items": [\n    "Tires"\n  ]\n}',
    );
    expect(planSave("Route notes.", written).needsConsent).toEqual([]);
  });

  it("a variable inserted from the menu is a {{name}} island", () => {
    const { editor, save } = open("Dear ");
    cursorAtEndOf(editor, "Dear");
    insertVariable(editor, "customer_name");
    expect(save()).toBe("Dear{{customer_name}} ");
  });

  it("editing a code block through its own editor changes only the fence body, and undo restores it", () => {
    const { editor, save } = open(PROMPT);
    const pos = find(editor.state.doc, (node) => node.type.name === "islandBlock");
    replaceIslandRaw(editor, pos, "```python\nprint('hello')\n```");
    cursorAtEndOf(editor, "Close politely");
    editor.commands.insertContent(" Thanks.");
    expect(save()).toBe(PROMPT.replace("print('hi')", "print('hello')").replace("politely.", "politely. Thanks."));
    editor.commands.undo();
    editor.commands.undo();
    expect(save()).toBe(PROMPT);
  });

  it("typing ``` and a language on an empty line becomes a code block", () => {
    const { editor, save } = open("Intro.");
    cursorAtEndOf(editor, "Intro");
    editor.commands.splitBlock();
    editor.commands.insertContent("```ts");
    expect(fenceFromParagraph(editor)).toBe(true);
    expect(save()).toBe("Intro.\n\n```ts\n\n```");
  });

  it("moving a block keeps its bytes and its islands, with no consent question", () => {
    const { editor, save } = open(PROMPT);
    const pos = find(editor.state.doc, (node) => node.type.name === "islandBlock");
    editor.commands.command(({ tr }) => {
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      return true;
    });
    moveBlock(editor, "down");
    const written = save();
    expect(written).toBe("Greet {{customer_name}}.\n\nClose politely.\n\n```python\nprint('hi')\n```");
    const plan = planSave(PROMPT, written);
    expect(plan.needsConsent).toEqual([]);
    expect(plan.error).toBeNull();
  });

  it("moving a paragraph up inside a block swaps just those lines", () => {
    const text = "First line of the stop list\nSecond stop\n\nTail.";
    const { editor, save } = open(text);
    // one paragraph with a soft break — split it into two, then move the second up
    cursorAtEndOf(editor, "First line");
    const pos = find(editor.state.doc, (node) => node.isText === true && (node.text ?? "").includes("Second stop"));
    editor.commands.command(({ tr }) => {
      tr.setSelection(TextSelection.create(tr.doc, pos + (editor.state.doc.nodeAt(pos)?.text ?? "").indexOf("Second")));
      return true;
    });
    editor.commands.splitBlock();
    moveBlock(editor, "up");
    expect(save()).toContain("Second stop\n\nFirst line of the stop list");
  });
});

describe("pure feature modules", () => {
  const NOTE = "# Alton pickup\n\nBring {{tote_count}} totes to `bay 4`.\n\n```sh\ntotes=6\n```\n\n## Alton pickup\n\nTotes are gray.";

  it("find skips protected content unless asked, and says how many it skipped", () => {
    const plain = findMatches(NOTE, "totes");
    expect(plain.matches.map((match) => NOTE.slice(match.start, match.end))).toEqual(["totes", "Totes"]);
    expect(plain.skippedProtected).toBe(1);
    const all = findMatches(NOTE, "totes", { includeProtected: true });
    expect(all.matches).toHaveLength(3);
  });

  it("replace touches only the matches it was given", () => {
    const { matches } = findMatches(NOTE, "totes", { caseSensitive: true });
    expect(replaceMatches(NOTE, matches, "totes", "bins")).toBe(NOTE.replace("{{tote_count}} totes", "{{tote_count}} bins"));
  });

  it("regex replace supports groups and reports an invalid pattern in words", () => {
    const { matches } = findMatches("bay 4, bay 12", "bay (\\d+)", { regex: true });
    expect(replaceMatches("bay 4, bay 12", matches, "bay (\\d+)", "dock $1", { regex: true })).toBe("dock 4, dock 12");
    expect(findMatches("x", "(", { regex: true }).error).toMatch(/not valid/);
  });

  it("the outline slugs headings the way the renderer does, duplicates numbered", () => {
    expect(outlineOf(NOTE).map((entry) => [entry.level, entry.text, entry.slug])).toEqual([
      [1, "Alton pickup", "alton-pickup"],
      [2, "Alton pickup", "alton-pickup-1"],
    ]);
  });

  it("word count reads prose only — code and variables are not words", () => {
    const metrics = measureText(NOTE);
    expect(metrics.words).toBe(12);
    expect(metrics.islands).toBe(2);
    expect(metrics.readingMinutes).toBe(1);
  });

  it("variables classify like the prompt builder's highlighter", () => {
    const declared = [{ name: "tote_count", type: "number" }];
    expect(classifyVariable("{{tote_count}}", declared).state).toBe("declared");
    expect(classifyVariable("{{driver}}", declared).state).toBe("undeclared");
    expect(classifyVariable("{{step_1.output}}", declared).state).toBe("literal");
    expect(classifyVariable("{{driver}}", null).state).toBe("unbound");
  });

  it("pasted HTML becomes markdown through the one converter — no escapes, code as a fence", () => {
    const html =
      '<h2>Pickup <em>window</em></h2><p>Call 5 * 3 minutes ahead, see <a href="https://oc.gov">OC</a>.</p><ul><li>Totes</li><li><strong>Straps</strong></li></ul><pre><code class="language-sql">select * from stops;</code></pre><img src="https://cdn.test/truck.png" alt="Truck">';
    expect(htmlToMarkdown(html, schema)).toBe(
      "## Pickup *window*\n\nCall 5 * 3 minutes ahead, see [OC](https://oc.gov).\n\n- Totes\n- **Straps**\n\n```sql\nselect * from stops;\n```\n\n![Truck](https://cdn.test/truck.png)",
    );
  });
});
