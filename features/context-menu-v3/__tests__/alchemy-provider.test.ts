/**
 * ALC-15 S3 — the context menu's rows reach the Alchemy registry as one
 * provider (LIST A2). Breaks each test names:
 * - a disabled universal verb vanishes or greys without a sentence (R1 c) → "verbs" red.
 * - a disabled non-verb row is greyed instead of absent (R1 b) → "absent" red.
 * - the rich-document tree is emitted twice (here AND by its provider) → "not re-emitted" red.
 * - agent libraries land outside the one "Improve with AI" group → "libraries" red.
 * - a menu instance's rows leak into another open menu → "instance" red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { richDocumentSectionId } from "@/features/rich-document/actions/provider";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import type { MenuModel, MenuNode, MenuSection } from "../model/menu-model";

const noop = () => undefined;
const item = (id: string, label: string, extra: Partial<MenuNode> = {}): MenuNode =>
  ({ kind: "item", id, label, onSelect: noop, ...extra }) as MenuNode;

function model(): MenuModel {
  const sections: MenuSection[] = [
    {
      id: "clipboard",
      group: "clipboard",
      nodes: [
        item("copy", "Copy"),
        item("cut", "Cut", { disabled: true }),
        item("paste", "Paste", { disabled: true }),
        item("select-all", "Select All"),
        item("speak", "Speak", { disabled: true }),
      ],
    },
    {
      id: "registry",
      group: "document",
      nodes: [
        item("rich:save-to-notes", "Save to Notes"),
        {
          kind: "submenu",
          id: "rich-sub:improve-with-ai",
          label: "Improve with AI",
          children: [
            item("rich:text-cleanup", "Clean up"),
            { kind: "separator", id: "rich-ai:sep" },
            {
              kind: "submenu",
              id: "placement:ai-action",
              label: "AI Actions",
              children: [item("shortcut:improve", "Improve Writing")],
            },
          ],
        } as MenuNode,
      ],
    },
    {
      id: "history",
      group: "history",
      nodes: [item("undo", "Undo", { disabled: true }), item("redo", "Redo"), item("view-history", "View History")],
    },
    { id: "surface", group: "surface-info", label: "Notes", nodes: [item("surface:location", "matrx-user/notes")] },
  ];
  return { header: null, sections, roles: {} as MenuModel["roles"] };
}

async function resolveFor(instanceId: string, ownerId = instanceId) {
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: `context-menu:${ownerId}`, tier: "T1", actions: () => contextMenuActionsFromModel(model(), ownerId) });
  const target = createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId } } });
  return registry.resolve(target);
}

describe("context-menu provider", () => {
  it("verbs: a disabled universal verb greys with its sentence", async () => {
    const byId = Object.fromEntries((await resolveFor("m1")).map((r) => [r.action.id, r.eligibility]));
    expect(byId["cm:copy"]).toEqual({ status: "available" });
    expect(byId["cm:cut"]).toEqual({ status: "unavailable-verb", verb: "cut", sentence: expect.stringMatching(/\w/) });
    expect(byId["cm:paste"]).toEqual({ status: "unavailable-verb", verb: "paste", sentence: expect.stringMatching(/\w/) });
    expect(byId["cm:undo"]).toMatchObject({ status: "unavailable-verb", verb: "undo" });
  });

  it("absent: a disabled row that is not a universal verb is not drawn", async () => {
    const ids = (await resolveFor("m1")).map((r) => r.action.id);
    expect(ids).not.toContain("cm:speak");
    expect(ids).toContain("cm:select-all");
  });

  it("the rich-document tree is not re-emitted; libraries join the one Improve-with-AI group", async () => {
    const resolved = await resolveFor("m1");
    const ids = resolved.map((r) => r.action.id);
    expect(ids.filter((id) => id.includes("rich"))).toEqual([]);
    const library = resolved.find((r) => r.action.id === "cm:placement:ai-action")?.action;
    expect(library?.section).toEqual({ id: richDocumentSectionId("Improve with AI"), label: "Improve with AI" });
    expect(library?.category).toBe("ai");
    expect(await library?.expand?.(createClickTarget(), new AbortController().signal)).toEqual([
      expect.objectContaining({ id: "cm:shortcut:improve", label: "Improve Writing" }),
    ]);
  });

  it("history rows sit under the one approved History heading; undo/redo ride the strip", async () => {
    const resolved = await resolveFor("m1");
    const byId = Object.fromEntries(resolved.map((r) => [r.action.id, r.action]));
    expect(byId["cm:view-history"]?.section?.label).toBe("History");
    expect(byId["cm:redo"]?.category).toBe("clipboard");
    expect(byId["cm:redo"]?.verb).toBe("redo");
    expect(byId["cm:surface:location"]?.section?.label).toBe("Notes");
  });

  it("instance: another open menu's rows never leak into this target", async () => {
    expect(await resolveFor("m2", "m1")).toEqual([]);
  });
});
