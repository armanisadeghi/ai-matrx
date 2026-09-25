/**
 * THE VISUAL ADAPTER GATE — the stored text is the truth.
 *
 * SUT: buildVisualDocument → a real headless Tiptap Editor → serializeVisualDocument, and the
 * save gate planSave. Every expected value is the fixture itself (stored bytes) plus the literal
 * characters a test types — never something the SUT computed.
 *
 * Breaks each test names:
 *   - a serializer that re-writes unchanged blocks (any normalization: `*`→`-`, `__`→`**`,
 *     `1)`→`1.`, dropped trailing spaces, escaped `*`) fails the no-edit round trip
 *   - an edit that re-serializes a whole block or document fails the exact-insertion checks
 *   - an island re-derived instead of copied fails the island checks
 *   - an escaping serializer fails the literal-typing check
 *   - a save gate that accepts island loss fails the consent checks
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";
import { createRichEditorExtensions } from "../core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
  type VisualBaseline,
} from "../core/visual-document";
import { mapSavePosition, planSave } from "../core/save-plan";
import {
  ALL_FIXTURES,
  INTAKE_PROMPT,
  ROUTE_PLANNING_NOTE,
  WINDOWS_LINE_ENDINGS,
} from "./fixtures";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);

interface Session {
  editor: Editor;
  baseline: VisualBaseline;
  save: () => string;
}

function open(text: string): Session {
  const { json, plan } = buildVisualDocument(text, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  const baseline = captureBaseline(editor.state.doc, plan);
  return { editor, baseline, save: () => serializeVisualDocument(editor.state.doc, baseline) };
}

const sessions: Session[] = [];
function track(session: Session): Session {
  sessions.push(session);
  return session;
}
afterEach(() => {
  while (sessions.length) sessions.pop()?.editor.destroy();
});

/** Position just inside the end of the first textblock whose text contains `needle`. */
function endOfTextblock(doc: PMNode, needle: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isTextblock && node.textContent.includes(needle)) {
      found = pos + 1 + node.content.size;
      return false;
    }
    return true;
  });
  if (found === -1) throw new Error(`no textblock contains "${needle}"`);
  return found;
}

function positionOf(doc: PMNode, needle: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text?.includes(needle)) {
      found = pos + (node.text.indexOf(needle) ?? 0);
      return false;
    }
    return true;
  });
  if (found === -1) throw new Error(`no text node contains "${needle}"`);
  return found;
}

function insertText(session: Session, pos: number, text: string): void {
  session.editor.commands.command(({ tr }) => {
    tr.insert(pos, session.editor.schema.text(text));
    return true;
  });
}

function islandsOf(text: string): string[] {
  return listIslands(tokenizeSource(text)).map((island) => `${island.islandType}|${island.raw}`);
}

describe("no edit → the stored bytes", () => {
  it.each(ALL_FIXTURES)("opening %s and saving without an edit writes back the stored text", (_, text) => {
    const session = track(open(text));
    expect(session.save()).toBe(text);
  });

  it.each(ALL_FIXTURES)("visual → source → visual → save leaves %s byte-identical", (_, text) => {
    const first = track(open(text));
    const again = track(open(first.save()));
    const plan = planSave(text, again.save());
    expect(plan.changed).toBe(false);
    expect(plan.text).toBe(text);
  });

  it("keeps the author's spellings the platform's defaults would rewrite", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    const written = session.save();
    for (const spelling of ["* Office park", "__licensed__", "1) Weigh", "***Priority:***", "5 \\* 3 &amp; done", "==============", "<https://calrecycle.ca.gov>"]) {
      expect(written).toContain(spelling);
    }
  });
});

describe("an edit changes bytes only where the person typed", () => {
  it("typing at the end of a paragraph inserts exactly those characters", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    insertText(session, endOfTextblock(session.editor.state.doc, "Plan the stop"), " Bring the dolly.");
    expect(session.save()).toBe(
      ROUTE_PLANNING_NOTE.replace("Plan the stop before lunch.", "Plan the stop before lunch. Bring the dolly."),
    );
  });

  it("typing inside a bullet keeps every other bullet's marker and indentation", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    insertText(session, endOfTextblock(session.editor.state.doc, "CRT monitors"), " (fragile)");
    expect(session.save()).toBe(
      ROUTE_PLANNING_NOTE.replace("pallets of CRT monitors", "pallets of CRT monitors (fragile)"),
    );
  });

  it("typing inside a quote keeps the quote prefix on every line", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    insertText(session, positionOf(session.editor.state.doc, "closed Tuesdays"), "always ");
    expect(session.save()).toBe(ROUTE_PLANNING_NOTE.replace("closed Tuesdays", "always closed Tuesdays"));
  });

  it("two edits in two blocks change exactly those two places", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    insertText(session, endOfTextblock(session.editor.state.doc, "Signed off"), " Thanks all.");
    insertText(session, endOfTextblock(session.editor.state.doc, "Photograph every manifest"), " twice");
    expect(session.save()).toBe(
      ROUTE_PLANNING_NOTE.replace("Photograph every manifest", "Photograph every manifest twice").replace(
        "Signed off by dispatch.",
        "Signed off by dispatch. Thanks all.",
      ),
    );
  });

  it("text typed in visual mode is written literally — no escapes", () => {
    const session = track(open(INTAKE_PROMPT));
    const typed = " Use *stars*, 5 * 3, snake_case, a \\ backslash & [brackets].";
    insertText(session, endOfTextblock(session.editor.state.doc, "under 120 words"), typed);
    expect(session.save()).toBe(`${INTAKE_PROMPT}${typed}`);
  });

  it("a new list item takes the list's own marker and numbering", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    session.editor.commands.setTextSelection(endOfTextblock(session.editor.state.doc, "Weigh in at the Tustin yard"));
    session.editor.commands.splitListItem("listItem");
    session.editor.commands.insertContent("Fuel up");
    expect(session.save()).toBe(
      ROUTE_PLANNING_NOTE.replace("1) Weigh in at the Tustin yard\n", "1) Weigh in at the Tustin yard\n2) Fuel up\n"),
    );
  });
});

describe("islands survive prose edits byte-for-byte", () => {
  it("bold, split and retype around a variable leave every island identical", () => {
    const session = track(open(ROUTE_PLANNING_NOTE));
    const before = islandsOf(ROUTE_PLANNING_NOTE);
    const start = positionOf(session.editor.state.doc, "dispatch confirms");
    session.editor.chain().setTextSelection({ from: start, to: start + 8 }).toggleBold().run();
    session.editor.commands.setTextSelection(positionOf(session.editor.state.doc, "Load weight"));
    session.editor.commands.splitBlock();
    const saved = session.save();
    expect(saved).toContain("**dispatch** confirms with {{dispatcher_name}} by 7:30.");
    const after = islandsOf(saved);
    for (const island of before) expect(after).toContain(island);
    expect(planSave(ROUTE_PLANNING_NOTE, saved).needsConsent).toEqual([]);
  });

  it("a CRLF block is held as source and written back untouched when other text changes", () => {
    const text = `${WINDOWS_LINE_ENDINGS}\nA plain follow-up line.`;
    const session = track(open(text));
    insertText(session, endOfTextblock(session.editor.state.doc, "follow-up"), " Done.");
    expect(session.save()).toBe(`${text} Done.`);
  });
});

describe("the save gate", () => {
  function deleteFirstVariable(session: Session): void {
    let at = -1;
    session.editor.state.doc.descendants((node, pos) => {
      if (at === -1 && node.type.name === "inlineIsland" && node.attrs.islandType === "variable") at = pos;
      return at === -1;
    });
    session.editor.commands.command(({ tr }) => {
      tr.delete(at, at + 1);
      return true;
    });
  }

  it("removing a {{variable}} is not saved without consent", () => {
    const session = track(open(INTAKE_PROMPT));
    deleteFirstVariable(session);
    const plan = planSave(INTAKE_PROMPT, session.save());
    expect(plan.needsConsent.map((delta) => [delta.kind, delta.before])).toEqual([
      ["removed", "{{company_name}}"],
    ]);
  });

  it("an island removed through its own editor is pre-approved", () => {
    const session = track(open(INTAKE_PROMPT));
    deleteFirstVariable(session);
    const plan = planSave(INTAKE_PROMPT, session.save(), {
      approvedIslands: new Set(["{{company_name}}"]),
    });
    expect(plan.needsConsent).toEqual([]);
    expect(plan.error).toBeNull();
  });

  it("an unclosed fence that swallows islands below is caught as swallowed", () => {
    const text = "Intro line.\n\n{{customer_message}}\n\n```json\n{\"stops\": 3}\n```";
    const plan = planSave(text, text.replace("Intro line.", "Intro line.\n\n```"));
    expect(plan.needsConsent.some((delta) => delta.kind === "swallowed")).toBe(true);
  });

  it("adding a variable needs no consent", () => {
    const plan = planSave(INTAKE_PROMPT, `${INTAKE_PROMPT}\n\nSign as {{agent_name}}.`);
    expect(plan.needsConsent).toEqual([]);
    expect(plan.islandDeltas.map((delta) => delta.kind)).toEqual(["added"]);
    expect(plan.error).toBeNull();
  });
});

describe("the strict splice contract (content-ir 0.13: islands change only through islandEdit)", () => {
  const STORED = "Greet {{customer_name}} warmly.\n\n```sql\nselect 1;\n```\n\nClose politely.";

  it("a prose edit and an island removal in the same paragraph save as two proven steps", () => {
    const current = "Greet warmly, always.\n\n```sql\nselect 1;\n```\n\nClose politely.";
    const plan = planSave(STORED, current, { approvedIslands: new Set(["{{customer_name}}"]) });
    expect(plan.error).toBeNull();
    expect(plan.needsConsent).toEqual([]);
    expect(plan.changeSteps).toHaveLength(2);
  });

  it("a code block edited in its own editor is spliced with islandEdit and nothing else moves", () => {
    const current = STORED.replace("select 1;", "select 2;");
    const plan = planSave(STORED, current, { approvedIslands: new Set(["```sql\nselect 1;\n```"]) });
    expect(plan.error).toBeNull();
    expect(plan.changeSteps).toHaveLength(1);
    expect(mapSavePosition(plan, STORED.indexOf("Close politely")).pos).toBe(current.indexOf("Close politely"));
  });

  it("an anchor after a two-step save lands on the same words", () => {
    const current = "Greet warmly, always.\n\n```sql\nselect 1;\n```\n\nClose politely.";
    const plan = planSave(STORED, current, { approvedIslands: new Set(["{{customer_name}}"]) });
    expect(mapSavePosition(plan, STORED.indexOf("politely")).pos).toBe(current.indexOf("politely"));
  });
});
