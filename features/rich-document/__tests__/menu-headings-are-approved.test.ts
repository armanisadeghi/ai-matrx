/**
 * EVERY HEADING THE REAL MENUS DRAW IS AN APPROVED ONE (ALC-15 round 3, chair
 * ruling D1). The package owns ONE approved-heading list (`APPROVED_HEADINGS`,
 * @ai-matrx/alchemy/menu); `buildMenuModel` throws in dev/test on any other
 * group heading and shows its rows inline in production. Agents coined
 * "Share & export", "Improve with AI", "Save as" (2026-09-24/25) — this test
 * runs the REAL host models (the answer menu of a chat message, admin seat,
 * and a grid cell's right-click) through the package's check.
 *
 * THE USE CASE: a pool-service dispatcher right-clicks an answer or a Visit
 * Date cell and finds every row under the names the classic menus always used.
 *
 * Break it names: a coined section label back in menuStructure.ts, or a
 * surface section declared as a group heading → buildMenuModel throws here.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import "../actions/handlers";
import { createActionRegistry, createClickTarget, type ActionProvider } from "@ai-matrx/alchemy/actions";
import { buildMenuModel, unapprovedHeadings } from "@ai-matrx/alchemy/menu";
import { richDocumentActionProvider, richDocumentClickTarget, richDocumentTargetHost } from "../actions/provider";
import { chatContext } from "../test-utils/chatContext";
import { contextMenuActionsFromModel } from "@/features/context-menu-v3/alchemy-provider";
import type { MenuModel, MenuNode, MenuSection } from "@/features/context-menu-v3/model/menu-model";

const ports = { diagnostics: { capture: jest.fn() } };

async function modelFor(providers: ActionProvider[], target: ReturnType<typeof createClickTarget>) {
  const registry = createActionRegistry({ ports });
  for (const p of providers) registry.register(p);
  // "throw" is the dev/test policy: an unapproved heading fails the build of the model.
  return buildMenuModel(target, await registry.resolve(target), { headingPolicy: "throw" });
}

const noop = () => undefined;
const item = (id: string, label: string): MenuNode => ({ kind: "item", id, label, onSelect: noop }) as MenuNode;

function gridCellMenu(): MenuModel {
  const sections: MenuSection[] = [
    { id: "extra:table-cell", group: "surface", label: "Cell · Visit date", primary: true, nodes: [item("copy-cell", "Copy")] },
    { id: "extra:table-row", group: "surface", label: "Row", nodes: [item("dup", "Duplicate row"), item("open", "Open record")] },
    { id: "clipboard", group: "clipboard", nodes: [item("copy", "Copy"), item("find", "Find")] },
    { id: "history", group: "history", nodes: [item("view-history", "View History")] },
  ];
  return { header: null, sections, roles: {} as MenuModel["roles"] };
}

describe("the real menus draw only approved headings", () => {
  it.each(["assistant", "user"] as const)("the %s message's answer menu (admin seat, every row eligible)", async (role) => {
    const ctx = chatContext(role, { isAdmin: true, isCreator: true });
    const model = await modelFor([richDocumentActionProvider], richDocumentClickTarget(ctx));
    expect(unapprovedHeadings(model)).toEqual([]);
    const headings = model.sections.map((s) => s.label).filter(Boolean);
    // The restored classic names are what she sees; the coined ones are gone.
    expect(headings).toEqual(expect.arrayContaining(["Conversation", "Save", "Export"]));
    for (const coined of ["Share & export", "Improve with AI", "Save as", "Ask in chat"]) expect(headings).not.toContain(coined);
  });

  it("a grid cell's right-click with the answer's rows (composite target)", async () => {
    const ctx = chatContext("assistant");
    const target = createClickTarget({
      host: { contextMenu: { kind: "context-menu", instanceId: "g1" }, richDocument: richDocumentTargetHost(ctx) },
    });
    const model = await modelFor(
      [{ id: "context-menu:g1", tier: "T1", actions: () => contextMenuActionsFromModel(gridCellMenu(), "g1") }, richDocumentActionProvider],
      target,
    );
    expect(unapprovedHeadings(model)).toEqual([]);
  });

  it("the check can fail: a coined heading throws with the remedy", async () => {
    const coined: ActionProvider = {
      id: "coined",
      tier: "T0",
      actions: () => [
        { id: "coined:x", label: "X", category: "export", section: { id: "rd:share-export", label: "Share & export" }, eligible: () => ({ status: "available" }), run: noop },
      ],
    };
    await expect(modelFor([coined], createClickTarget({}))).rejects.toThrow(/Share & export.*not an approved heading/);
  });
});
