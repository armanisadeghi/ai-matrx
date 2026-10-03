/**
 * THE PROPOSED MENU'S RULES (Arman, 2026-10-02). Breaks each test names:
 * - more than six icons, or a submenu drawn as an icon (a chevron in the icon row) → red.
 * - Archive pushed out of the icons by text-editing verbs → red.
 * - no "Intelligence" row, or an AI row left outside it → red.
 * - more than four of the thing's own rows at the top level → red.
 * - any resolved row reachable neither at the top nor inside a submenu (lost) → red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/components/icons/domain-icons", () => ({ INTELLIGENCE_ICON: () => null }));

import { createClickTarget, type Action, type ActionCategory, type ResolvedAction } from "@ai-matrx/alchemy/actions";
import { proposedArrangement, OWN_ROWS_MAX, STRIP_MAX } from "../proposed-arrangement";

const row = (id: string, label: string, category: ActionCategory, extra: Partial<Action> = {}): ResolvedAction => ({
  action: { id, label, category, run: () => undefined, ...extra },
  eligibility: { status: "available" },
});
const lib = (id: string, label: string) => row(id, label, "ai", { expand: async () => [] });

function noteMenu(): ResolvedAction[] {
  return [
    row("cm:copy", "Copy", "clipboard"),
    row("cm:cut", "Cut", "clipboard"),
    row("cm:paste", "Paste", "clipboard"),
    row("cm:speak", "Speak", "clipboard"),
    row("cm:find", "Find & Replace", "clipboard"),
    row("cm:x:share", "Share link…", "edit"),
    row("cm:x:dup", "Duplicate", "edit"),
    row("cm:x:fav", "Add to favorites", "edit"),
    row("cm:x:export", "Export as Markdown", "edit"),
    row("cm:x:trash", "Move to Trash", "edit"),
    row("cm:x:a", "Open", "edit"),
    row("cm:x:b", "Open in new tab", "edit"),
    row("cm:x:c", "Rename…", "edit"),
    row("cm:x:d", "Move to…", "edit"),
    row("cm:x:e", "Settings", "edit"),
    row("cm:x:built", "Built on it", "edit", { expand: async () => [] }),
    row("cm:select-all", "Select All", "edit"),
    row("cm:copy-as", "Copy as", "clipboard", { expand: async () => [] }),
    lib("cm:placement:ai-action", "AI Actions"),
    lib("cm:placement:bound-agent", "Agents"),
    row("cm:chat", "Chat", "app"),
    row("rich:summarize", "Summarize & listen", "listen"),
    row("cm:quick-actions", "Quick Actions", "feedback", { expand: async () => [] }),
    row("cm:x:surface", "This page", "surface-info", { expand: async () => [] }),
  ];
}

const target = createClickTarget({ readOnly: false, writable: [], payloadKinds: ["markdown"], host: {} });

async function reachable(top: ResolvedAction[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of top) {
    ids.add(r.action.id);
    if (r.action.id.startsWith("proposed:") && r.action.expand) {
      for (const child of await r.action.expand(target, new AbortController().signal)) ids.add(child.id);
    }
  }
  return ids;
}

describe("the proposed right-click menu", () => {
  const top = proposedArrangement(target, noteMenu(), { noun: "note" });
  const strip = top.filter((r) => r.action.category === "clipboard");

  it("draws at most six icons, none of them a submenu", () => {
    expect(strip.length).toBeLessThanOrEqual(STRIP_MAX);
    expect(strip.filter((r) => r.action.expand)).toEqual([]);
  });

  it("keeps Archive on the icon row, red, at the end, even when text editing fills the slots", () => {
    const last = strip[strip.length - 1]!;
    expect(last.action.id).toBe("cm:x:trash");
    expect(last.action.destructive).toBe(true);
  });

  it("shows four of the thing's own rows, then More <thing> options", () => {
    const own = top.filter((r) => r.action.id.startsWith("cm:x:") && r.action.category === "edit");
    expect(own.length).toBe(OWN_ROWS_MAX);
    expect(top.some((r) => r.action.id === "proposed:more" && r.action.label === "More note options")).toBe(true);
  });

  it("puts every AI row inside one Intelligence row", async () => {
    const intel = top.find((r) => r.action.id === "proposed:intelligence");
    expect(intel?.action.label).toBe("Intelligence");
    const inside = (await intel!.action.expand!(target, new AbortController().signal)).map((a) => a.id);
    expect(inside).toEqual(expect.arrayContaining(["cm:placement:ai-action", "cm:placement:bound-agent", "cm:chat", "rich:summarize"]));
    expect(top.filter((r) => r.action.category === "ai" && r.action.id !== "proposed:intelligence")).toEqual([]);
  });

  it("loses nothing: every resolved row is on the menu or one submenu down", async () => {
    const ids = await reachable(top);
    expect(noteMenu().map((r) => r.action.id).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("is always there, even with no AI rows resolved", () => {
    const bare = proposedArrangement(target, [row("cm:copy", "Copy", "clipboard")], { noun: "table" });
    expect(bare.some((r) => r.action.id === "proposed:intelligence")).toBe(true);
  });
});
