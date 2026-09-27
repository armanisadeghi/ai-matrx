/**
 * @jest-environment jsdom
 */
/**
 * The platform `surface_feedback` target: offered on every mounted surface,
 * refused before anything is written when the value is bad, filed through the
 * one feedback submit path with the right row shape, and answered with an
 * outcome the agent can trust. Only the manifest registry, toast, error
 * capture, the store read and the submit action are faked; the seam and the
 * runtime registry run for real.
 */
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();
const mockGetManifest = jest.fn();
const mockSubmitFeedback = jest.fn();
let mockOrganizationId: string | null = "org-1";

jest.mock("@/lib/toast", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: mockCaptureError,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));
jest.mock("@/actions/feedback.actions", () => ({
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: mockOrganizationId } }),
  }),
}));

import {
  applySurfaceWrite,
  listAgentWritableTargets,
} from "../surface-writeback";
import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";

const PAGE = "matrx-user/education-classes";
const PANEL = "matrx-user/class-detail";

function mount(name: string, depth: number): () => void {
  return registerSurfaceRuntime({ surfaceName: name, getScope: () => ({}) }, depth);
}

const GOOD = {
  kind: "missing_capability",
  message: "There is no write target to change exam dates.",
  target_or_value: "update_classes",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrganizationId = "org-1";
  mockGetManifest.mockReturnValue({});
  mockSubmitFeedback.mockResolvedValue({ success: true, data: { id: "fb-123" } });
});

describe("surface_feedback — offered", () => {
  it("is offered whenever a registered surface is mounted, on the primary one", () => {
    expect(listAgentWritableTargets()).toEqual([]);
    const unPage = mount(PAGE, 1);
    const unPanel = mount(PANEL, 2);
    try {
      const offered = listAgentWritableTargets().filter(
        (entry) => entry.target.name === "surface_feedback",
      );
      expect(offered).toHaveLength(1);
      expect(offered[0].surfaceName).toBe(PANEL);
      expect(offered[0].policy).toBe("auto");
      expect(offered[0].target.mode).toBe("entity");
      expect(offered[0].target.description).toContain("changes NOTHING");
      expect(offered[0].target.description).toContain(`Open surfaces: ${PANEL}, ${PAGE}`);
    } finally {
      unPanel();
      unPage();
    }
    expect(listAgentWritableTargets()).toEqual([]);
  });
});

describe("surface_feedback — refused before anything is written", () => {
  it.each([
    ["a bad kind", { ...GOOD, kind: "complaint" }, /"kind" must be one of/],
    ["an empty message", { ...GOOD, message: "   " }, /at least 10 characters/],
    ["an unknown key", { ...GOOD, severity: "high" }, /does not take "severity"/],
  ])("refuses %s", async (_label, value, pattern) => {
    const unregister = mount(PAGE, 1);
    try {
      const result = await applySurfaceWrite("surface_feedback", value, {
        origin: "agent",
        quiet: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.phase).toBe("before_approval");
        expect(result.error).toMatch(pattern);
      }
      expect(mockSubmitFeedback).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("refuses a surface that is not mounted", async () => {
    const unregister = mount(PAGE, 1);
    try {
      const result = await applySurfaceWrite("surface_feedback", GOOD, {
        origin: "agent",
        surfaceName: "matrx-user/not-here",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(`Open surfaces: ${PAGE}`);
      expect(mockSubmitFeedback).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("refuses with the remedy when no organization is selected", async () => {
    mockOrganizationId = null;
    const unregister = mount(PAGE, 1);
    try {
      const result = await applySurfaceWrite("surface_feedback", GOOD, { origin: "agent" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("pick their organization");
      expect(mockSubmitFeedback).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});

describe("surface_feedback — filed and answered", () => {
  it("files the row shape, needs no approval, and returns the outcome", async () => {
    const unPage = mount(PAGE, 1);
    const unPanel = mount(PANEL, 2);
    const requestApproval = jest.fn();
    try {
      window.history.pushState({}, "", "/education/classes");
      // A JSON-encoded string is parsed like every object target; `surface`
      // picks the outer page instead of the deepest one.
      const result = await applySurfaceWrite("surface_feedback", JSON.stringify(GOOD), {
        origin: "agent",
        surfaceName: PAGE,
        actorLabel: "Class planner",
        conversationId: "conv-9",
        agentId: "agent-7",
        requestApproval,
      });
      expect(requestApproval).not.toHaveBeenCalled();
      expect(mockSubmitFeedback).toHaveBeenCalledWith({
        feedback_type: "feature",
        route: "/education/classes",
        organization_id: "org-1",
        description:
          `[surface feedback] ${PAGE} · missing_capability · update_classes\n\n` +
          "There is no write target to change exam dates.",
        metadata: {
          source: "surface_agent_feedback",
          surface_name: PAGE,
          kind: "missing_capability",
          target_or_value: "update_classes",
          conversation_id: "conv-9",
          agent_id: "agent-7",
          agent_name: "Class planner",
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          surfaceName: PAGE,
          outcome: {
            summary: `Feedback saved for ${PAGE} (id fb-123). Thank you — the team reads it on the next update.`,
            data: { id: "fb-123" },
          },
        }),
      );
    } finally {
      unPanel();
      unPage();
    }
  });

  it("maps bug to 'bug' and everything else to 'suggestion'", async () => {
    const unregister = mount(PAGE, 1);
    try {
      await applySurfaceWrite("surface_feedback", { kind: "bug", message: "The save button threw." }, { origin: "agent", quiet: true });
      await applySurfaceWrite("surface_feedback", { kind: "missing_data", message: "Class list came as a lookup, not inline." }, { origin: "agent", quiet: true });
      expect(mockSubmitFeedback.mock.calls.map((c) => c[0].feedback_type)).toEqual([
        "bug",
        "suggestion",
      ]);
      expect(mockSubmitFeedback.mock.calls[1][0].metadata.target_or_value).toBeNull();
    } finally {
      unregister();
    }
  });

  it("reports a failed submit loudly as an apply failure", async () => {
    mockSubmitFeedback.mockResolvedValue({ success: false, error: "RLS says no" });
    const unregister = mount(PAGE, 1);
    try {
      const result = await applySurfaceWrite("surface_feedback", GOOD, { origin: "agent" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.phase).toBe("apply");
        expect(result.error).toContain("RLS says no");
      }
      expect(mockCaptureError).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});
