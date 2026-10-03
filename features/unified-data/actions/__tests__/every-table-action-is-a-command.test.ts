/**
 * G4 — COMMAND PARITY (lane TABLE-ACTIONS, handoff §6): every table action with a label is a ⌘K
 * command, with its chord and its disabled reason, and running the command runs the menu entry's
 * own action. Cedar Ridge's front desk types "archive" in ⌘K on "Referral Intake Queue" and gets the
 * same Archive table the header ⋯ offers.
 *
 * The break this names: an action dropped from the command list (or given a second `run`), or a
 * chord the menu shows that the command does not.
 */
import { tableActions, type TableActionHost } from "@ai-matrx/records-ui/object-actions";
import { whatYouMayDo } from "@ai-matrx/records-ui";
import { pageCommands, registerPageCommands } from "@/features/knowledge/command-bar/commands";
import { itemMenuToCommands, toKnowledgeCommands } from "../tableActionCommands";
import { toItemMenuConfig } from "../tableActionAdapters";

const TABLE = { id: "b03c4308-a53a-4691-a06b-f633bca0877f", name: "Referral Intake Queue" };
const ran: string[] = [];
const host: TableActionHost = {
  share: () => void ran.push("share"),
  export: () => void ran.push("export"),
  archive: () => void ran.push("archive"),
  rename: () => void ran.push("rename"),
  copyText: () => void ran.push("copy-link"),
  extend: () => [{ id: "workflows", label: "Workflows", icon: "blocks", group: "built-on", run: () => void ran.push("workflows") }],
};

describe.each(["admin", "viewer"] as const)("a %s", (seat) => {
  const actions = tableActions({ table: TABLE, rights: whatYouMayDo(seat, true), host });
  const commands = toKnowledgeCommands(actions, TABLE.name);

  it("finds every labelled action as a command, with its chord and its reason", () => {
    expect(commands.map((c) => c.id)).toEqual(actions.filter((a) => a.label).map((a) => `table-action:${a.id}`));
    for (const a of actions) {
      const c = commands.find((x) => x.id === `table-action:${a.id}`)!;
      expect(c.shortcut).toBe(a.shortcut);
      expect(c.disabledReason).toBe(a.disabledReason);
    }
    expect(commands.find((c) => c.id === "table-action:share")?.shortcut).toBe("⌥⇧S");
    expect(commands.find((c) => c.id === "table-action:archive")?.shortcut).toBe("⌥⇧⌫");
  });
});

it("running a command runs the menu's own action", () => {
  ran.length = 0;
  const commands = toKnowledgeCommands(tableActions({ table: TABLE, rights: whatYouMayDo("admin", true), host }), TABLE.name);
  for (const id of ["share", "export", "archive", "workflows"]) commands.find((c) => c.id === `table-action:${id}`)!.run();
  expect(ran).toEqual(["share", "export", "archive", "workflows"]);
});

it("a page's commands reach the bar while it is mounted, and leave with it", () => {
  const off = registerPageCommands(() => toKnowledgeCommands(tableActions({ table: TABLE, rights: whatYouMayDo("admin", true), host }), TABLE.name));
  expect(pageCommands().map((c) => c.label)).toEqual(expect.arrayContaining(["Archive table", "Share…", "Export…", "Duplicate"]));
  off();
  expect(pageCommands()).toEqual([]);
});

it("a focused Data home row's menu is the same commands, running the row menu's own entries", () => {
  ran.length = 0;
  const actions = tableActions({ table: TABLE, rights: whatYouMayDo("admin", true), host });
  const fromRowMenu = itemMenuToCommands(toItemMenuConfig(actions), TABLE.name);
  expect(fromRowMenu.map((c) => c.id)).toEqual(toKnowledgeCommands(actions, TABLE.name).map((c) => c.id));
  fromRowMenu.find((c) => c.id === "table-action:archive")!.run();
  expect(ran).toEqual(["archive"]);
});
