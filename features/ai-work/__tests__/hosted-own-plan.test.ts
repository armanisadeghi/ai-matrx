/**
 * FORCING GUARD — a hosted run on the person's own Claude plan says so on the
 * wire, and works in the folder the server allows.
 *
 * Once a person has an own-plan sign-in in their box, the server REFUSES any
 * hosted run whose workspace is `/home/agent` itself (the sign-in lives
 * there), and it bills AI Matrx credits whenever `billing` is absent. So the
 * body `startHostedRun` sends is the whole contract: the payer it names, and a
 * default folder below the home for BOTH payers. Only the wire is mocked.
 */

const callApi = jest.fn();
const apiGet = jest.fn();
const apiPost = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
  callApi: (...args: unknown[]) => callApi(...args),
}));
jest.mock("@/lib/api/typed-client", () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: (...args: unknown[]) => apiPost(...args),
  buildPath: (template: string, params: Record<string, string>) =>
    template.replace(/\{([^}]+)\}/g, (_m, key: string) =>
      encodeURIComponent(params[key]),
    ),
}));
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({ adoptForeignStream: () => ({ type: "test/adopt" }) }),
);

import {
  HOSTED_STREAM_PATH,
  HOSTED_WORKSPACE_ROOT,
  startHostedRun,
} from "@/features/ai-work/lib/hostedSandboxRun";
import { submitOwnPlanCode } from "@/features/ai-work/lib/ownPlan";

type Thunk = (dispatch: Dispatch, getState: () => unknown) => unknown;
type Dispatch = (action: unknown) => unknown;

const dispatch: Dispatch = (action) =>
  typeof action === "function"
    ? (action as Thunk)(dispatch, () => ({}))
    : action;

function sentBody(): Record<string, unknown> {
  expect(callApi).toHaveBeenCalledTimes(1);
  const request = callApi.mock.calls[0][0] as {
    path: string;
    body: Record<string, unknown>;
  };
  expect(request.path).toBe(HOSTED_STREAM_PATH);
  return request.body;
}

beforeEach(() => {
  callApi.mockReset();
  apiPost.mockReset();
  callApi.mockReturnValue(async () => ({ error: null }));
});

describe("who pays for a hosted run", () => {
  it("sends own_plan and the projects folder for an own-plan run", async () => {
    await dispatch(
      startHostedRun({
        conversationId: "c-1",
        prompt: "Fix the failing test",
        billing: "own_plan",
      }),
    );
    const body = sentBody();
    expect(body.billing).toBe("own_plan");
    expect(body.workspace_root).toBe("/home/agent/projects");
  });

  it("defaults to AI Matrx credits, still below the home folder", async () => {
    await dispatch(
      startHostedRun({ conversationId: "c-2", prompt: "Fix the failing test" }),
    );
    const body = sentBody();
    expect(body.billing).toBe("platform");
    expect(body.workspace_root).toBe(HOSTED_WORKSPACE_ROOT);
    expect(body.workspace_root).toBe("/home/agent/projects");
  });

  it("keeps a folder the caller chose, whoever pays", async () => {
    await dispatch(
      startHostedRun({
        conversationId: "c-3",
        prompt: "Fix the failing test",
        billing: "own_plan",
        workspaceRoot: "/home/agent/projects/site",
      }),
    );
    expect(sentBody().workspace_root).toBe("/home/agent/projects/site");
  });

  it("hands the pasted code to the Claude code door, trimmed", async () => {
    apiPost.mockResolvedValue({
      data: { provider: "claude_code", state: "signed_in", signed_in: true },
      meta: {},
    });
    const status = await submitOwnPlanCode("claude_code", "  abc#123  ");
    expect(apiPost).toHaveBeenCalledWith(
      "/coding-sessions/own-plan/claude_code/code",
      { authorization_code: "abc#123" },
    );
    expect(status.state).toBe("signed_in");
  });
});
