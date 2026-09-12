const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();
const mockGetManifest = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));

import {
  applySurfaceWrite,
  listAgentWritableTargets,
  listUnwiredAgentTargets,
  refuseSurfaceWrite,
  __resetUnwiredTargetReports,
} from "./surface-writeback";
import { registerSurfaceRuntime } from "./SurfaceRuntimeContext";

const target = {
  name: "review_field",
  label: "Review field",
  description: "Test target",
  valueType: "string" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
};

describe("surface writeback handler outcomes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManifest.mockReturnValue({ writeTargets: [target] });
  });

  it("returns an expected domain refusal without an error toast or capture", async () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () =>
            refuseSurfaceWrite("Use the correction target for agent columns."),
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "wrong target");

    expect(result).toEqual({
      ok: false,
      refused: true,
      error: "Use the correction target for agent columns.",
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
    unregister();
  });

  it("keeps unexpected handler failures loud", async () => {
    const failure = new Error("Database write failed.");
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () => {
            throw failure;
          },
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "value");

    expect(result).toEqual({ ok: false, error: "Database write failed." });
    expect(mockToastError).toHaveBeenCalledWith("Database write failed.");
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-writeback",
        message: "[surface-writeback] Database write failed.",
      }),
    );
    unregister();
  });
});

/**
 * THE OFFER IS NEVER WIDER THAN THE WIRING (live defect, 2026-09-12).
 *
 * `matrx-user/masterwork-rulebook` declares `rule_draft`, and is mounted both
 * by the Rulebook detail page (which registers a handler) and by every
 * `/masterwork/[id]/<lane>` route. On a mount with no handler the Masterwork
 * Conductor was told it could stage a rule and found there was nothing to stage
 * it with. The offer builder must drop such a target — and say so.
 */
describe("agent write-target offer", () => {
  const ruleDraft = {
    name: "rule_draft",
    label: "Rule draft",
    description: "Stages a proposed rule in the page's Add/Edit Rule dialog.",
    valueType: "object" as const,
    mode: "draft" as const,
    applyPolicy: "ask" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetUnwiredTargetReports();
    mockGetManifest.mockReturnValue({ writeTargets: [ruleDraft] });
  });

  it("offers a declared target only when a handler is mounted", () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/masterwork-rulebook",
        getScope: () => ({}),
        getWriteHandlers: () => ({ rule_draft: () => {} }),
      },
      1,
    );

    expect(listAgentWritableTargets().map((entry) => entry.target.name)).toEqual(
      ["rule_draft"],
    );
    expect(listUnwiredAgentTargets()).toEqual([]);
    unregister();
  });

  it("refuses to offer a declared target with no handler, loudly", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const unregister = registerSurfaceRuntime(
      { surfaceName: "matrx-user/masterwork-rulebook", getScope: () => ({}) },
      1,
    );

    expect(listAgentWritableTargets()).toEqual([]);
    expect(
      listUnwiredAgentTargets().map((entry) => entry.target.name),
    ).toEqual(["rule_draft"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('declares agent-writable target "rule_draft"'),
    );
    // One line per page load, not one per turn.
    listAgentWritableTargets();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    unregister();
  });

  it("still fails loudly if an unwired target is applied anyway", async () => {
    const unregister = registerSurfaceRuntime(
      { surfaceName: "matrx-user/masterwork-rulebook", getScope: () => ({}) },
      1,
    );

    const result = await applySurfaceWrite("rule_draft", { mode: "new" });

    expect(result.ok).toBe(false);
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-writeback",
        message: expect.stringContaining("registered no handler"),
      }),
    );
    unregister();
  });
});
