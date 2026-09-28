/**
 * THE REGROUP LOSES NOTHING SILENTLY (Arman, 2026-09-27: "I'm not willing to
 * lose important features").
 *
 * Breaks each test names:
 * - a registry action the proposed grouping puts in no top-level row and no
 *   submenu, without a merge record → "lost" red (the demo's red list).
 * - the audit trusting the regroup's own bookkeeping instead of what the
 *   regrouped menu holds → "broken regroup" red.
 * - a submenu row greyed with its reason moved inside a submenu (where every
 *   row is drawn runnable) → "greyed" red.
 * - a submenu named with a coined container word, or one member folded alone
 *   into a submenu → "shape" red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/components/icons/domain-icons", () => ({ AGENT_ICON: () => null }));

import { createClickTarget, type Action, type ActionCategory, type ResolvedAction } from "@ai-matrx/alchemy/actions";
import { isContainerWord } from "@ai-matrx/alchemy/menu";
import { auditRegroup, regroupResolved, REGROUP_ID_PREFIX } from "../grouping";
import { PROPOSED_MENU_GROUPING } from "../proposed-grouping";

const target = createClickTarget({ readOnly: true });

function action(id: string, label: string, category: ActionCategory, extra: Partial<Action> = {}): ResolvedAction {
  return {
    action: { id, label, category, eligible: () => ({ status: "available" }), run: () => undefined, ...extra },
    eligibility: { status: "available" },
  };
}

// A quiz row's menu, shaped like the live one: the row's own section, the verb
// strip, copy formats, saves, shares, agents, listening, feedback.
const ROW: ResolvedAction[] = [
  action("cm:open", "Open", "edit", { section: { id: "cm-table-row", label: "Quiz", primary: true } as Action["section"] }),
  action("cm:take", "Take", "edit", { section: { id: "cm-table-row", label: "Quiz", primary: true } as Action["section"] }),
  action("cm:copy", "Copy", "clipboard", { verb: "copy" }),
  action("copy-markdown", "Copy as Markdown", "copy"),
  action("copy-plain-text", "Copy as plain text", "copy"),
  action("compare-with-clipboard", "Compare with clipboard", "edit"),
  action("set-compare-base", "Set as compare base", "edit"),
  action("save-to-task", "Create Task", "save"),
  action("save-to-notes", "Save to Notes", "save"),
  action("save-as-file", "Download as Markdown", "save"),
  action("download-pdf", "Download as PDF", "export"),
  action("share-webpage", "Share as webpage", "share"),
  action("cm:share", "Share", "share"),
  action("cm:placement:ai-action", "AI Actions", "ai", { expand: async () => [] }),
  action("cm:chat", "Chat", "app"),
  action("summarize-and-listen", "Summarize & listen", "listen"),
  action("cm:speak", "Speak", "clipboard"),
  action("tts-play", "Read aloud", "listen"),
  action("tts-play-2", "Read aloud", "listen"),
  action("thumbs-up", "Good answer", "feedback"),
  action("cm:quick-actions", "Quick Actions", "feedback", { expand: async () => [] }),
];

describe("regroup — nothing is lost silently", () => {
  it("every current action has a home, and the proposal is shorter", () => {
    const audit = auditRegroup(target, ROW, PROPOSED_MENU_GROUPING, { mergeSameName: true }, "command");
    expect(audit.lost).toEqual([]);
    expect(audit.rows).toHaveLength(ROW.length);
    expect(audit.proposedRows).toBeLessThan(audit.currentRows);
    const where = Object.fromEntries(audit.rows.map((r) => [r.id, r.proposedPlace]));
    expect(where["copy-markdown"]).toBe("Copy ▸");
    expect(where["save-as-file"]).toBe("Download ▸");
    expect(where["download-pdf"]).toBe("Download ▸");
    expect(where["save-to-notes"]).toBe("Convert to ▸");
    expect(where["share-webpage"]).toBe("Top level");
    expect(where["cm:share"]).toBe("Top level");
    expect(where["compare-with-clipboard"]).toBe("Compare ▸");
    expect(where["save-to-task"]).toBe("Convert to ▸");
    expect(where["cm:chat"]).toBe("AI ▸");
    expect(where["cm:speak"]).toBe("Read aloud ▸");
    expect(where["tts-play-2"]).toBe("Read aloud ▸ Read aloud");
    expect(audit.rows.find((r) => r.id === "cm:open")?.proposed?.kind).toBe("page-first");
  });

  it("a page's own row that duplicates a category moves into it and merges with its twin", () => {
    const note = { id: "cm-extra-note", label: "Note", kind: "target" } as Action["section"];
    const NOTE: ResolvedAction[] = [
      action("cm:copy", "Copy", "clipboard", { verb: "copy" }),
      action("save-as-file", "Download as Markdown", "save"),
      action("download-pdf", "Download as PDF", "export"),
      action("cm:share", "Share", "share"),
      action("cm:attach", "Attach To", "share"),
      action("cm:x:duplicate", "Duplicate", "edit", { section: note }),
      action("cm:x:export", "Export as Markdown", "edit", { section: note }),
      action("cm:x:share-link", "Share link…", "edit", { section: note }),
      action("cm:x:share-clipboard", "Copy to clipboard", "edit", { section: note }),
      action("cm:x:convert-artifacts", "Convert blocks to artifacts", "edit", { section: note }),
      action("cm:x:move", "Move to Folder", "edit", { section: note, expand: async () => [] }),
      action("cm:x:delete", "Move to Trash", "edit", { section: note }),
    ];
    const audit = auditRegroup(target, NOTE, PROPOSED_MENU_GROUPING, { mergeSameName: true }, "command");
    expect(audit.lost).toEqual([]);
    const where = Object.fromEntries(audit.rows.map((r) => [r.id, r.proposedPlace]));
    expect(where["cm:x:export"]).toBe("Download ▸ Download as Markdown");
    expect(where["cm:x:share-clipboard"]).toBe("Top level · Copy");
    expect(where["cm:x:share-link"]).toBe("Top level · Share");
    expect(where["cm:x:move"]).toBe("Organize ▸");
    expect(audit.rows.find((r) => r.id === "cm:x:duplicate")?.proposed?.kind).toBe("page-first");
    expect(audit.rows.find((r) => r.id === "cm:x:delete")?.proposed?.kind).toBe("page-first");
  });

  it("a merge is a record, never a drop: turning merging off keeps both rows", () => {
    const merged = regroupResolved(target, ROW, PROPOSED_MENU_GROUPING, { mergeSameName: true });
    expect(merged.members.get("listen")?.map((r) => r.action.id)).not.toContain("tts-play-2");
    const kept = regroupResolved(target, ROW, PROPOSED_MENU_GROUPING, { mergeSameName: false });
    expect(kept.members.get("listen")?.map((r) => r.action.id)).toContain("tts-play-2");
  });

  it("broken regroup: an action dropped by the regroup is reported lost, from what the menu holds", () => {
    const lossy: typeof regroupResolved = (...args) => {
      const result = regroupResolved(...args);
      // Drop a member from the Download submenu but keep its bookkeeping entry.
      const download = result.members.get("download") ?? [];
      result.members.set("download", download.filter((r) => r.action.id !== "download-pdf"));
      return result;
    };
    const audit = auditRegroup(target, ROW, PROPOSED_MENU_GROUPING, { mergeSameName: true }, "command", lossy);
    expect(audit.lost.map((r) => r.id)).toEqual(["download-pdf"]);
  });

  it("greyed: a row greyed with its reason stays at the top level with that reason", () => {
    const greyed: ResolvedAction = {
      ...action("send-google-doc", "Send to Google Doc", "share"),
      eligibility: { status: "unavailable", sentence: "Connect Google first" },
    };
    const result = regroupResolved(target, [...ROW, greyed], PROPOSED_MENU_GROUPING, { mergeSameName: true });
    expect(result.resolved.map((r) => r.action.id)).toContain("send-google-doc");
    expect(result.home.get("send-google-doc")?.kind).toBe("top");
  });

  it("shape: submenus carry plain names and a lone member is never folded", () => {
    for (const g of PROPOSED_MENU_GROUPING.groups) expect(isContainerWord(g.label)).toBe(false);
    const result = regroupResolved(
      target,
      [action("share-webpage", "Share as webpage", "share")],
      PROPOSED_MENU_GROUPING,
      { mergeSameName: true },
    );
    expect(result.resolved.map((r) => r.action.id)).toEqual(["share-webpage"]);
    expect(result.resolved.some((r) => r.action.id.startsWith(REGROUP_ID_PREFIX))).toBe(false);
  });
});
