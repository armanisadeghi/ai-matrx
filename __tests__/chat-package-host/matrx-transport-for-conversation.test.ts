/**
 * matrx-transport-for-conversation.test.ts — the conversation-scoped
 * `MatrxTransport`: base URL + credentials come from the SAME
 * `resolveBackendForConversation` the execute thunks use, and credentials ride
 * on top of the wire headers. `X-Organization-Id` is owned by the resolver
 * (conversation org, app-selection fallback) and passes through untouched.
 */

import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

jest.mock("@ai-matrx/data/net", () => ({
  resilientFetch: jest.fn(),
  isNetError: () => false,
}));


// The host's own transport (behind the server port) reads these.

jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/resolve-base-url", () => ({
  resolveBackendForConversation: jest.fn(),
}));

// jest.setup.ts has already pulled the app graph in through the surface/context registrations, so
// `@ai-matrx/agents/matrx` is cached BOUND TO THE REAL `@ai-matrx/data/net`; the mocks above would
// never reach it and the real resilientFetch ran (jsdom's AbortSignal handed to Node's fetch:
// "Expected signal to be an instance of AbortSignal"). Reset, then load the subject fresh so it
// binds the mock. A test-environment realm mismatch, not a product bug: a browser has one realm.
jest.resetModules();
/* eslint-disable @typescript-eslint/no-require-imports */
const { resilientFetch } = require("@ai-matrx/data/net") as typeof import("@ai-matrx/data/net");
const { configureServerForTest } = require("@ai-matrx/chat/testing/server-test-host") as typeof import("@ai-matrx/chat/testing/server-test-host");
const { resolveBackendForConversation } = require("@ai-matrx/chat/agents/redux/execution-system/thunks/resolve-base-url") as typeof import("@ai-matrx/chat/agents/redux/execution-system/thunks/resolve-base-url");
const { createMatrxTransportForConversation } = require("@ai-matrx/chat/agents/redux/execution-system/thunks/matrx-transport-for-conversation") as typeof import("@ai-matrx/chat/agents/redux/execution-system/thunks/matrx-transport-for-conversation");
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedFetch = resilientFetch as jest.MockedFunction<
  typeof resilientFetch
>;
const mockedResolve = resolveBackendForConversation as jest.Mock;
const getState = () =>
  ({ apiConfig: { activeServer: "production" } }) as unknown as ChatRootState;

beforeEach(() => {
  // The package hands its target to the host's transport (P9): this app's own.
  configureServerForTest({
    createMatrxTransportFromTarget: jest.requireActual("@host/lib/api/matrx-transport")
      .createMatrxTransportFromTarget,
  });
  mockedFetch.mockReset();
  mockedResolve.mockReset();
  mockedFetch.mockResolvedValue({
    response: {
      ok: true,
      status: 200,
      json: async () => ({}),
      clone() {
        return this;
      },
    } as unknown as Response,
    controller: new AbortController(),
  });
});

describe("createMatrxTransportForConversation", () => {
  it("routes through the conversation's resolved backend with its credentials on top of wire headers", async () => {
    mockedResolve.mockReturnValue({
      baseUrl: "https://sandbox-proxy.test",
      channel: "override",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer conversation-jwt",
        "X-Organization-Id": "org-42",
      },
    });
    const transport = createMatrxTransportForConversation(getState, "conv-1");

    await transport.fetch("/ai/conversations/conv-1/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(mockedResolve).toHaveBeenCalledWith(expect.anything(), "conv-1");
    const [url, init] = mockedFetch.mock.calls[0];
    expect(url).toBe("https://sandbox-proxy.test/ai/conversations/conv-1/resume");
    const headers = init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer conversation-jwt",
      // Organization admission: the resolver's header passes through as-is.
      "X-Organization-Id": "org-42",
    });
  });

  it("throws loudly when no backend URL is configured", async () => {
    mockedResolve.mockReturnValue(null);
    const transport = createMatrxTransportForConversation(getState, "conv-2");
    await expect(
      transport.fetch("/ai/conversations/conv-2", {
        method: "POST",
        headers: {},
        body: "{}",
      }),
    ).rejects.toThrow(/No backend URL configured/);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
