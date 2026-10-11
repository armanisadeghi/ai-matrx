/**
 * `list_surface_write_targets` — the read that lets a rendered kind component
 * decide whether an apply control is REAL here (absent or honest, never dead).
 *
 * The seam is mocked at the writeback boundary so the test proves the
 * handler's contract (filters, the hasHandler pass-through, the safe
 * envelope on bad input) without mounting a page.
 */
import type {
  KindActionContext,
  KindActionDefinition,
} from "../react/actions/kind-action-context";

const listLiveWriteTargets = jest.fn();
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-writeback", () => ({
  listLiveWriteTargets: () => listLiveWriteTargets(),
}));

import { KIND_ACTIONS } from "../react/actions/kind-action-provider";

function getKindAction(key: string): KindActionDefinition | undefined {
  return KIND_ACTIONS.find((d) => d.key === key);
}

const ctx: KindActionContext = {
  launchAgent: async () => ({ conversationId: "c", requestId: "r" }) as never,
  userId: "u",
  openShortcut: async () => ({ conversationId: "c2" }),
  runShortcut: async () => ({ ok: true, data: null }),
  itemState: null,
  openFile: () => undefined,
  shareFile: () => undefined,
};

function live(surfaceName: string, name: string, hasHandler: boolean) {
  return {
    surfaceName,
    hasHandler,
    target: { name, label: name, mode: "draft" as const, valueType: "string", description: "" },
  };
}

describe("list_surface_write_targets", () => {
  beforeEach(() => listLiveWriteTargets.mockReset());

  it("is registered under its stable key", () => {
    expect(getKindAction("list_surface_write_targets")).toBeDefined();
  });

  it("lists every reachable target with hasHandler passed through", async () => {
    listLiveWriteTargets.mockReturnValue([
      live("matrx-admin/mandate-workspace", "mandate_goal_draft", true),
      live("matrx-admin/mandates", "select_mandate", false),
    ]);
    const res = await getKindAction("list_surface_write_targets")!.handler({}, ctx);
    expect(res).toEqual({
      ok: true,
      result: {
        targets: [
          {
            surfaceName: "matrx-admin/mandate-workspace",
            target: "mandate_goal_draft",
            label: "mandate_goal_draft",
            mode: "draft",
            hasHandler: true,
          },
          {
            surfaceName: "matrx-admin/mandates",
            target: "select_mandate",
            label: "select_mandate",
            mode: "draft",
            hasHandler: false,
          },
        ],
      },
    });
  });

  it("narrows by target name and by surface", async () => {
    listLiveWriteTargets.mockReturnValue([
      live("matrx-admin/mandate-workspace", "mandate_goal_draft", true),
      live("matrx-admin/mandates", "select_mandate", true),
    ]);
    const byTarget = await getKindAction("list_surface_write_targets")!.handler(
      { target: "mandate_goal_draft" },
      ctx,
    );
    expect(byTarget.ok && (byTarget.result as { targets: unknown[] }).targets).toHaveLength(1);
    const bySurface = await getKindAction("list_surface_write_targets")!.handler(
      { surfaceName: "matrx-admin/mandates" },
      ctx,
    );
    expect(bySurface.ok && (bySurface.result as { targets: { target: string }[] }).targets[0].target).toBe(
      "select_mandate",
    );
  });

  it("answers an empty list — not an error — when nothing is mounted", async () => {
    listLiveWriteTargets.mockReturnValue([]);
    const res = await getKindAction("list_surface_write_targets")!.handler(
      { target: "mandate_goal_draft" },
      ctx,
    );
    expect(res).toEqual({ ok: true, result: { targets: [] } });
  });

  it("refuses non-object input with a safe envelope, never a throw", async () => {
    listLiveWriteTargets.mockReturnValue([]);
    const res = await getKindAction("list_surface_write_targets")!.handler("nope", ctx);
    expect(res.ok).toBe(false);
  });
});
