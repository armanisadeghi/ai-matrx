/**
 * What the MODEL is told for every outcome of `apply_surface_write`.
 *
 * The education classes incident (2026-09-27): the person approved, the page's
 * handler threw, and the person believed the agent was never told. This pins
 * the tool result for success (with what landed), decline, refusal before the
 * card, and failure after approval — each carrying one self-contained sentence
 * in BOTH `output.message` and `error_message`.
 *
 * Only the network funnel (`submitToolResult`), the approval card bridge and
 * the agent-name lookup are faked; the real seam (`applySurfaceWrite`) runs.
 */
const mockSubmitToolResult = jest.fn((payload: unknown) => ({
  type: "test/submitToolResult",
  payload,
}));
const mockRequestInlineApproval = jest.fn();
const mockGetManifest = jest.fn();

jest.mock("@/features/agents/api/submit-tool-results", () => ({
  submitToolResult: (payload: unknown) => mockSubmitToolResult(payload),
}));
jest.mock("@/features/agents/ui-first-tools/redux/request-approval", () => ({
  requestInlineApproval: (args: unknown) => mockRequestInlineApproval(args),
}));
jest.mock("@/features/surfaces/hooks/useAgentNames", () => ({
  resolveAgentName: async () => "Class builder",
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAgentById: () => undefined,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import {
  dispatchSurfaceWrite,
  surfaceWriteFailureSentence,
} from "../dispatch-surface-write.thunk";
import {
  registerSurfaceRuntime,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";
import type { RootState } from "@/lib/redux/store";

const createClasses = {
  name: "create_classes",
  label: "Create classes",
  description: "Creates classes.",
  valueType: "array" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
} satisfies SurfaceWriteTarget;

interface SubmittedResult {
  is_error: boolean;
  output: Record<string, unknown>;
  error_message?: string;
}

async function run(
  handlers: SurfaceWriteHandlers,
  value: unknown,
): Promise<SubmittedResult> {
  const unregister = registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/classes-test",
      getScope: () => ({}),
      getWriteHandlers: () => handlers,
    },
    30,
  );
  try {
    const dispatch = jest.fn((action: unknown) => action);
    const getState = () =>
      ({
        conversations: { byConversationId: { c1: { agentId: "agent-1" } } },
      }) as unknown as RootState;
    await dispatchSurfaceWrite({
      conversationId: "c1",
      requestId: "r1",
      callId: "call-1",
      toolName: "apply_surface_write",
      args: { target: "create_classes", value },
    })(dispatch, getState, undefined);
    expect(mockSubmitToolResult).toHaveBeenCalledTimes(1);
    return mockSubmitToolResult.mock.calls[0][0] as unknown as SubmittedResult;
  } finally {
    unregister();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetManifest.mockReturnValue({ writeTargets: [createClasses] });
  mockRequestInlineApproval.mockResolvedValue({ kind: "approved" });
});

describe("apply_surface_write tool result", () => {
  it("success carries the summary and what landed", async () => {
    const submitted = await run(
      {
        create_classes: {
          apply: () => ({
            summary: "Created 1 class: Algebra I.",
            data: { created: [{ id: "k1", name: "Algebra I" }] },
          }),
        },
      },
      '[{"name":"Algebra I"}]',
    );
    expect(submitted.is_error).toBe(false);
    expect(submitted.output).toEqual(
      expect.objectContaining({
        ok: true,
        target: "create_classes",
        message: '"Create classes" applied and saved. Created 1 class: Algebra I.',
        result: { created: [{ id: "k1", name: "Algebra I" }] },
      }),
    );
  });

  it("a handler throw after approval tells the model the user approved and what the page said", async () => {
    const submitted = await run(
      {
        create_classes: () => {
          throw new Error('Row 1 is missing "name".');
        },
      },
      [{}],
    );
    expect(mockRequestInlineApproval).toHaveBeenCalledTimes(1);
    expect(submitted.is_error).toBe(true);
    expect(submitted.output.stage).toBe("after_approval");
    expect(submitted.output.user_approved).toBe(true);
    expect(submitted.output.message).toBe(submitted.error_message);
    expect(submitted.error_message).toContain(
      'The user approved the "create_classes" write, but the page could not apply it: Row 1 is missing "name".',
    );
    expect(submitted.error_message).toContain("The write did not complete.");
  });

  it("a refusal before the card says the user was not asked, with the reason, and shows no card", async () => {
    const submitted = await run(
      {
        create_classes: {
          validate: () => {
            throw new Error('Row 1: "access_mode" must be "open" or "closed".');
          },
          apply: jest.fn(),
        },
      },
      [{ access_mode: "sometimes" }],
    );
    expect(mockRequestInlineApproval).not.toHaveBeenCalled();
    expect(submitted.is_error).toBe(true);
    expect(submitted.output.reason).toBe("surface_write_refused");
    expect(submitted.output.stage).toBe("before_approval");
    expect(submitted.error_message).toContain(
      'apply_surface_write("create_classes") was refused before the user was asked: Row 1: "access_mode" must be "open" or "closed".',
    );
    expect(submitted.error_message).toContain("Correct the value and call apply_surface_write again.");
  });

  it("a wrong-type value is refused before the card with what was received", async () => {
    const submitted = await run({ create_classes: jest.fn() }, "not json at all");
    expect(mockRequestInlineApproval).not.toHaveBeenCalled();
    expect(submitted.is_error).toBe(true);
    expect(submitted.error_message).toContain("expects `value` to be a JSON array");
    expect(submitted.error_message).toContain("not json at all");
  });

  it("a decline is not an error and says nothing changed", async () => {
    mockRequestInlineApproval.mockResolvedValue({ kind: "rejected" });
    const apply = jest.fn();
    const submitted = await run({ create_classes: apply }, [{}]);
    expect(apply).not.toHaveBeenCalled();
    expect(submitted.is_error).toBe(false);
    expect(submitted.output).toEqual(
      expect.objectContaining({ ok: false, declined: true }),
    );
    expect(submitted.output.message).toContain("Nothing was changed.");
  });
});

describe("surfaceWriteFailureSentence", () => {
  it("says 'Nothing was changed.' once when the page's message already does", () => {
    const sentence = surfaceWriteFailureSentence(
      "create_classes",
      { error: "create_classes was refused: 2 problems. 1. a 2. b Nothing was changed.", phase: "before_approval", refused: true },
      false,
    );
    expect(sentence.match(/Nothing was changed\./g)).toHaveLength(1);
  });

  it("adds it when the page's message does not", () => {
    const sentence = surfaceWriteFailureSentence(
      "create_classes",
      { error: "bad date", phase: "before_approval", refused: true },
      false,
    );
    expect(sentence).toContain("bad date. Nothing was changed. Correct the value");
  });
});
