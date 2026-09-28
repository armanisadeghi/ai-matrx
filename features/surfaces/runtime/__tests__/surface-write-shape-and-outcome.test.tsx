/**
 * @jest-environment jsdom
 */
/**
 * The declared-type gate, the pre-approval `validate` hook and the write
 * outcome — the three seam behaviours the education classes incident
 * (2026-09-27) proved missing:
 *
 *  1. a smaller model sent an ARRAY target's value as a JSON-encoded string;
 *     nothing parsed it, the person approved a card that looked right, and
 *     only then did the handler refuse;
 *  2. the page's shape check ran only AFTER the person pressed Apply;
 *  3. after a successful create the agent re-read a list that did not show
 *     the new rows yet and retried.
 *
 * Only the manifest registry, toast and error capture are faked. The seam,
 * the runtime registry and `useSurfaceWriteHandlers` run for real.
 */
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();
const mockGetManifest = jest.fn();

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

import { renderHook } from "@/test-utils/renderHook";
import {
  applySurfaceWrite,
  coerceDeclaredValueType,
  type SurfaceWriteApprovalDecision,
} from "../surface-writeback";
import {
  registerSurfaceRuntime,
  useSurfaceWriteHandlers,
  type SurfaceWriteHandlers,
} from "../SurfaceRuntimeContext";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";

const SURFACE = "matrx-user/shape-test";

const arrayTarget = {
  name: "create_rows",
  label: "Create rows",
  description: "Creates rows.",
  valueType: "array" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
} satisfies SurfaceWriteTarget;

const objectTarget = {
  name: "row_draft",
  label: "Row draft",
  description: "Stages a row draft.",
  valueType: "object" as const,
  mode: "draft" as const,
  applyPolicy: "ask" as const,
} satisfies SurfaceWriteTarget;

function mount(handlers: SurfaceWriteHandlers): () => void {
  return registerSurfaceRuntime(
    {
      surfaceName: SURFACE,
      getScope: () => ({}),
      getWriteHandlers: () => handlers,
    },
    20,
  );
}

function approver(decision: SurfaceWriteApprovalDecision = { kind: "approved" }) {
  return jest.fn(async () => decision);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetManifest.mockReturnValue({ writeTargets: [arrayTarget, objectTarget] });
});

describe("declared valueType — parse a JSON string, refuse a mismatch before approval", () => {
  it("parses a JSON-encoded array for an array target before the card and the handler", async () => {
    const apply = jest.fn();
    const requestApproval = approver();
    const unregister = mount({ create_rows: apply });
    try {
      const result = await applySurfaceWrite(
        "create_rows",
        '[{"name":"Algebra I","access_mode":"closed"}]',
        { origin: "agent", quiet: true, requestApproval },
      );
      expect(result.ok).toBe(true);
      // The card shows the value AS IT WILL BE APPLIED (post-parse).
      expect(requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          value: [{ name: "Algebra I", access_mode: "closed" }],
        }),
      );
      expect(apply).toHaveBeenCalledWith([
        { name: "Algebra I", access_mode: "closed" },
      ]);
    } finally {
      unregister();
    }
  });

  it("tolerates a ```json fence around an object", async () => {
    const apply = jest.fn();
    const unregister = mount({ row_draft: apply });
    try {
      const result = await applySurfaceWrite(
        "row_draft",
        '```json\n{"access_mode":"closed"}\n```',
        { origin: "agent", quiet: true, requestApproval: approver() },
      );
      expect(result.ok).toBe(true);
      expect(apply).toHaveBeenCalledWith({ access_mode: "closed" });
    } finally {
      unregister();
    }
  });

  it("refuses an unparseable string BEFORE approval, naming expected vs received with an excerpt", async () => {
    const apply = jest.fn();
    const requestApproval = approver();
    const unregister = mount({ create_rows: apply });
    try {
      const result = await applySurfaceWrite(
        "create_rows",
        '[{"name": "Algebra I", "access_mode": "closed"',
        { origin: "agent", requestApproval },
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.phase).toBe("before_approval");
      expect(result.refused).toBe(true);
      expect(result.error).toContain("expects `value` to be a JSON array");
      expect(result.error).toContain("received a string that is not valid JSON");
      expect(result.error).toContain('[{"name": "Algebra I"');
      expect(requestApproval).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
      // The model's mistake, not a platform defect.
      expect(mockCaptureError).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("refuses a JSON string of the WRONG structure (object for an array target)", async () => {
    const requestApproval = approver();
    const unregister = mount({ create_rows: jest.fn() });
    try {
      const result = await applySurfaceWrite(
        "create_rows",
        '{"name":"Algebra I"}',
        { origin: "agent", requestApproval },
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toContain("it parses as JSON, but as an object");
      expect(requestApproval).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("caps the excerpt at 160 characters", () => {
    const verdict = coerceDeclaredValueType(arrayTarget, "x".repeat(500));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    const excerpt = /: (x+…)/.exec(verdict.error)?.[1] ?? "";
    expect(excerpt.length).toBe(160);
  });

  it("passes null through to the handler (several handlers read it as 'clear')", () => {
    expect(coerceDeclaredValueType(objectTarget, null)).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("{ validate, apply } — the page's own check runs before the card", () => {
  it("returns a validate throw as a refusal and never shows the card", async () => {
    const apply = jest.fn();
    const requestApproval = approver();
    const unregister = mount({
      create_rows: {
        validate: (value) => {
          if (!Array.isArray(value) || value.length === 0) return;
          throw new Error('Row 1: "access_mode" must be "open" or "closed".');
        },
        apply,
      },
    });
    try {
      const result = await applySurfaceWrite(
        "create_rows",
        [{ access_mode: "sometimes" }],
        { origin: "agent", requestApproval },
      );
      expect(result).toEqual({
        ok: false,
        refused: true,
        phase: "before_approval",
        error: 'Row 1: "access_mode" must be "open" or "closed".',
      });
      expect(requestApproval).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("runs validate on the PARSED value, then asks, then applies", async () => {
    const order: string[] = [];
    const unregister = mount({
      create_rows: {
        validate: (value) => {
          order.push(`validate:${Array.isArray(value) ? "array" : typeof value}`);
        },
        apply: () => {
          order.push("apply");
        },
      },
    });
    try {
      const result = await applySurfaceWrite("create_rows", '[{"a":1}]', {
        origin: "agent",
        quiet: true,
        requestApproval: async () => {
          order.push("approval");
          return { kind: "approved" };
        },
      });
      expect(result.ok).toBe(true);
      expect(order).toEqual(["validate:array", "approval", "validate:array", "apply"]);
    } finally {
      unregister();
    }
  });

  it("proxies an object handler registered through useSurfaceWriteHandlers (validate AND apply)", async () => {
    const apply = jest.fn(() => ({ summary: "Created 1 row." }));
    const validate = jest.fn((value: unknown) => {
      if (Array.isArray(value) && value.length > 2) {
        throw new Error("At most 2 rows per call.");
      }
    });
    const unregisterRuntime = registerSurfaceRuntime(
      { surfaceName: SURFACE, getScope: () => ({}) },
      21,
    );
    const hook = await renderHook(() =>
      useSurfaceWriteHandlers(SURFACE, { create_rows: { validate, apply } }),
    );
    try {
      const refused = await applySurfaceWrite("create_rows", [1, 2, 3], {
        origin: "agent",
        requestApproval: approver(),
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("unreachable");
      expect(refused.error).toBe("At most 2 rows per call.");
      expect(apply).not.toHaveBeenCalled();

      const landed = await applySurfaceWrite("create_rows", [1], {
        origin: "agent",
        quiet: true,
        requestApproval: approver(),
      });
      expect(landed).toEqual(
        expect.objectContaining({
          ok: true,
          outcome: { summary: "Created 1 row." },
        }),
      );
      expect(apply).toHaveBeenCalledWith([1]);
    } finally {
      await hook.unmount();
      unregisterRuntime();
    }
  });
});

describe("SurfaceWriteOutcome — what landed rides back on the result", () => {
  it("surfaces what apply returned", async () => {
    const unregister = mount({
      create_rows: {
        apply: async () => ({
          summary: "Created 2 classes.",
          data: { created: [{ id: "c1", name: "Algebra I" }, { id: "c2", name: "Geometry" }] },
        }),
      },
    });
    try {
      const result = await applySurfaceWrite("create_rows", [{}, {}], {
        origin: "agent",
        quiet: true,
        requestApproval: approver(),
      });
      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          outcome: {
            summary: "Created 2 classes.",
            data: {
              created: [
                { id: "c1", name: "Algebra I" },
                { id: "c2", name: "Geometry" },
              ],
            },
          },
        }),
      );
    } finally {
      unregister();
    }
  });

  it("surfaces an outcome from a PLAIN function handler, and ignores incidental return values", async () => {
    const unregister = mount({
      create_rows: () => ({ summary: "Created 1 row.", data: { id: "r1" } }),
      row_draft: () => ({ type: "someSlice/setDraft", payload: {} }) as unknown as void,
    });
    try {
      const withOutcome = await applySurfaceWrite("create_rows", [{}], { quiet: true });
      expect(withOutcome).toEqual(
        expect.objectContaining({
          ok: true,
          outcome: { summary: "Created 1 row.", data: { id: "r1" } },
        }),
      );
      const incidental = await applySurfaceWrite("row_draft", {}, { quiet: true });
      expect(incidental.ok).toBe(true);
      expect(incidental).not.toHaveProperty("outcome");
    } finally {
      unregister();
    }
  });

  it("a handler throw AFTER approval carries the handler's message and phase 'apply'", async () => {
    const requestApproval = approver();
    const unregister = mount({
      create_rows: () => {
        throw new Error("A class named \"Algebra I\" already exists.");
      },
    });
    try {
      const result = await applySurfaceWrite("create_rows", [{}], {
        origin: "agent",
        requestApproval,
      });
      expect(requestApproval).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        ok: false,
        phase: "apply",
        error: 'A class named "Algebra I" already exists.',
      });
    } finally {
      unregister();
    }
  });
});
