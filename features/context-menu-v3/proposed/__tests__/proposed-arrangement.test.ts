/**
 * THE PROPOSED MENU'S RULES (Arman, 2026-10-02). Breaks each test names:
 * - more than six icons, or a submenu drawn as an icon (a chevron in the icon row) → red.
 * - a thing's icons missing Archive, or Archive not red and last → red.
 * - editable text losing Cut / Paste from its icons → red.
 * - no "Intelligence" row, or an AI row left outside it → red.
 * - more than four own rows at the top level → red.
 * - any resolved row reachable neither at the top nor one submenu down (lost) → red.
 * - a thing that brings its own Export still offering the page-text PDF/Word/HTML rows → red;
 *   dropping those rows for a thing WITHOUT its own Export (nothing else would save it) → red.
 */
jest.mock("@ai-matrx/rich-content/utils/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/components/icons/domain-icons", () => ({ INTELLIGENCE_ICON: () => null, AGENT_ICON: () => null }));

import { createClickTarget, type Action, type ActionCategory, type ResolvedAction } from "@ai-matrx/alchemy/actions";
import { clickedKind, proposedArrangement, OWN_ROWS_MAX, STRIP_MAX } from "../proposed-arrangement";

const row = (id: string, label: string, category: ActionCategory, extra: Partial<Action> = {}): ResolvedAction => ({
  action: { id, label, category, run: () => undefined, eligible: () => ({ status: "available" }), ...extra } as Action,
  eligibility: { status: "available" },
});
const sub = (id: string, label: string, category: ActionCategory) => row(id, label, category, { expand: async () => [] });

const universal = (): ResolvedAction[] => [
  row("cm:copy", "Copy", "clipboard"),
  row("cm:speak", "Speak", "clipboard"),
  row("cm:find", "Find & Replace", "clipboard"),
  row("cm:select-all", "Select All", "edit"),
  sub("cm:copy-as", "Copy as", "clipboard"),
  sub("cm:export", "Export", "save"),
  row("download-pdf", "Download PDF", "export"),
  row("download-docx", "Download Word", "export"),
  row("download-html", "Download HTML", "export"),
  row("save-as-pdf", "Save as PDF Document", "save"),
  row("cm:attach", "Attach To", "share"),
  sub("cm:placement:ai-action", "AI Actions", "ai"),
  sub("cm:placement:bound-agent", "Agents", "ai"),
  row("cm:chat", "Chat", "app"),
  row("summarize-and-listen", "Summarize & listen", "listen"),
  sub("cm:quick-actions", "Quick Actions", "feedback"),
  row("submit-feedback", "Submit feedback", "feedback"),
  sub("cm:x:surface", "This page", "surface-info"),
];

const thingRows = (): ResolvedAction[] => [
  ...universal(),
  row("cm:x:open", "Open", "edit"),
  row("cm:x:tab", "Open in new tab", "edit"),
  row("cm:x:link", "Copy link", "edit"),
  row("cm:x:rename", "Rename…", "edit"),
  row("cm:x:dup", "Duplicate", "edit"),
  row("cm:x:fav", "Add to favorites", "edit"),
  row("cm:x:share", "Share…", "edit"),
  row("cm:x:export", "Export…", "edit"),
  row("cm:x:move", "Move to…", "edit"),
  row("cm:x:settings", "Settings", "edit"),
  sub("cm:x:built", "Built on it", "edit"),
  row("cm:x:archive", "Archive table", "edit"),
];

const editableRows = (): ResolvedAction[] => [
  ...universal(),
  row("cm:cut", "Cut", "clipboard"),
  row("cm:paste", "Paste", "clipboard"),
  row("cm:undo", "Undo", "clipboard"),
  row("cm:redo", "Redo", "clipboard"),
  row("cm:save", "Save", "edit"),
];

const thing = createClickTarget({ readOnly: true, writable: [], payloadKinds: ["markdown"], host: {} });
const editable = createClickTarget({ readOnly: false, writable: [], payloadKinds: ["markdown"], host: {} });

async function reachable(top: ResolvedAction[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of top) {
    ids.add(r.action.id);
    if (r.action.id.startsWith("proposed:") && r.action.expand) {
      for (const child of await r.action.expand(thing, new AbortController().signal)) ids.add(child.id);
    }
  }
  return ids;
}
const stripOf = (top: ResolvedAction[]) => top.filter((r) => r.action.category === "clipboard");

describe("the proposed right-click menu", () => {
  it("knows what was clicked", () => {
    expect(clickedKind(thing, thingRows())).toBe("thing");
    expect(clickedKind(editable, editableRows())).toBe("editable");
    expect(clickedKind(thing, universal())).toBe("text");
  });

  it("a thing: at most six one-action icons, Archive red and last", () => {
    const strip = stripOf(proposedArrangement(thing, thingRows(), { noun: "table" }));
    expect(strip.length).toBeLessThanOrEqual(STRIP_MAX);
    expect(strip.filter((r) => r.action.expand)).toEqual([]);
    expect(strip.map((r) => r.action.id)).toEqual(["cm:copy", "cm:x:share", "cm:x:dup", "cm:x:fav", "cm:x:export", "cm:x:archive"]);
    expect(strip[strip.length - 1]!.action.destructive).toBe(true);
  });

  it("editable text keeps its editing icons", () => {
    const strip = stripOf(proposedArrangement(editable, editableRows(), { noun: "note" }));
    expect(strip.map((r) => r.action.id)).toEqual(["cm:cut", "cm:copy", "cm:paste", "cm:undo", "cm:redo", "cm:find"]);
  });

  it("four own rows, then More <thing> options; Copy link folds behind Share", async () => {
    const top = proposedArrangement(thing, thingRows(), { noun: "table" });
    const own = top.filter((r) => r.action.id.startsWith("cm:x:") && r.action.category === "edit");
    expect(own.length).toBe(OWN_ROWS_MAX);
    expect(own.map((r) => r.action.id)).not.toContain("cm:x:link");
    const more = top.find((r) => r.action.id === "proposed:more");
    expect(more?.action.label).toBe("More table options");
    expect((await more!.action.expand!(thing, new AbortController().signal)).map((a) => a.id)).toContain("cm:x:link");
  });

  it("every AI row sits inside one Intelligence row, always present", async () => {
    const top = proposedArrangement(thing, thingRows(), { noun: "table" });
    const intel = top.find((r) => r.action.id === "proposed:intelligence")!;
    const inside = (await intel.action.expand!(thing, new AbortController().signal)).map((a) => a.id);
    expect(inside).toEqual(expect.arrayContaining(["cm:placement:ai-action", "cm:placement:bound-agent", "cm:chat", "summarize-and-listen"]));
    expect(top.filter((r) => r.action.category === "ai" && r.action.id !== "proposed:intelligence")).toEqual([]);
    expect(proposedArrangement(thing, [row("cm:copy", "Copy", "clipboard")], { noun: "table" }).some((r) => r.action.id === "proposed:intelligence")).toBe(true);
  });

  const PAGE_TEXT_FILES = ["cm:export", "download-pdf", "download-docx", "download-html", "save-as-pdf"];

  it("a thing with its own Export offers only that Export, never the page-text files", async () => {
    const ids = await reachable(proposedArrangement(thing, thingRows(), { noun: "table" }));
    expect(PAGE_TEXT_FILES.filter((id) => ids.has(id))).toEqual([]);
    expect(ids.has("cm:x:export")).toBe(true);
  });

  it("a thing without its own Export keeps the page-text files", async () => {
    const quiz = [...universal(), row("cm:x:open", "Open", "edit"), row("cm:x:archive", "Archive quiz", "edit")];
    const ids = await reachable(proposedArrangement(thing, quiz, { noun: "quiz" }));
    expect(PAGE_TEXT_FILES.filter((id) => !ids.has(id))).toEqual([]);
  });

  it.each([
    ["a thing", thing, thingRows, PAGE_TEXT_FILES],
    ["editable text", editable, editableRows, []],
  ] as const)("loses nothing on %s but the files its own Export replaces", async (_name, target, rows, replaced) => {
    const ids = await reachable(proposedArrangement(target, rows(), { noun: "x" }));
    expect(rows().map((r) => r.action.id).filter((id) => !ids.has(id))).toEqual([...replaced]);
  });
});

// CHAIR-UI-STORE item 3 (2026-10-03): on a store record's grid row the own rows are Open record,
// Row history, Copy row, Insert above/below, Duplicate, Merge with…, Link a record… — and "Link a
// record…" fell under "More table options". It is the record's own verb: top level, after Open.
describe("Link a record… sits beside Open", () => {
  it("is a top-level row right after Open on a store record's row", () => {
    const rows = [
      ...universal(),
      // A right-click on a CELL: the cell's own rows come first.
      row("cm:x:cell-paste", "Paste", "edit"),
      row("cm:x:cell-clear", "Clear cell", "edit"),
      row("cm:x:cell-who", "Who changed this?", "edit"),
      row("cm:x:cell-filter", "Show rows with this value", "edit"),
      row("cm:x:row-open", "Open record", "edit"),
      row("cm:x:row-history", "Row history", "edit"),
      row("cm:x:row-copy", "Copy row", "edit"),
      row("cm:x:row-insert-above", "Insert row above", "edit"),
      row("cm:x:row-insert-below", "Insert row below", "edit"),
      row("cm:x:row-merge", "Merge with…", "edit"),
      row("cm:x:row-link", "Link a record…", "edit"),
      row("cm:x:row-archive", "Delete row…", "edit"),
    ];
    const top = proposedArrangement(thing, rows, { noun: "table" });
    const ids = top.map((r) => r.action.id);
    expect(ids).toContain("cm:x:row-link");
    expect(ids).toContain("cm:x:row-open");
    expect(ids.indexOf("cm:x:row-link")).toBe(ids.indexOf("cm:x:row-open") + 1);
  });

  it("keeps Merge, Split and Extract parent top-level on a record's row, not under More", () => {
    const rows = [
      ...universal(),
      row("cm:x:cell-paste", "Paste", "edit"),
      row("cm:x:cell-clear", "Clear cell", "edit"),
      row("cm:x:cell-who", "Who changed this?", "edit"),
      row("cm:x:row-open", "Open record", "edit"),
      row("cm:x:row-history", "Row history", "edit"),
      row("cm:x:row-copy", "Copy row", "edit"),
      row("cm:x:row-merge", "Merge with…", "edit"),
      row("cm:x:row-split", "Split…", "edit"),
      row("cm:x:row-extract", "Extract parent…", "edit"),
      row("cm:x:row-link", "Link a record…", "edit"),
    ];
    const top = proposedArrangement(thing, rows, { noun: "table" }).map((r) => r.action.id);
    for (const id of ["cm:x:row-merge", "cm:x:row-split", "cm:x:row-extract"]) expect(top).toContain(id);
  });
});
