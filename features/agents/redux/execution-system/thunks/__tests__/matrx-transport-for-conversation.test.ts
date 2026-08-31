/**
 * matrx-transport-for-conversation.test.ts — the conversation-scoped
 * `MatrxTransport`: base URL + credentials come from the SAME
 * `resolveBackendForConversation` the execute thunks use, and credentials ride
 * on top of the wire headers. `X-Organization-Id` is owned by the resolver
 * (conversation org, app-selection fallback) and passes through untouched.
 */

import type { RootState } from "@/lib/redux/store";

jest.mock("@ai-matrx/data/net", () => ({
  resilientFetch: jest.fn(),
  isNetError: () => false,
}));
jest.mock("@/lib/diagnostics/captureApiError", () => ({
  captureApiError: jest.fn(),
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://backend.test",
  selectEndpointOverrideConfig: () => null,
  selectAiApiVersion: () => "v1",
}));
jest.mock("../resolve-base-url", () => ({
  resolveBackendForConversation: jest.fn(),
}));

import { resilientFetch } from "@ai-matrx/data/net";
import { resolveBackendForConversation } from "../resolve-base-url";
import { createMatrxTransportForConversation } from "../matrx-transport-for-conversation";

const mockedFetch = resilientFetch as jest.MockedFunction<
  typeof resilientFetch
>;
const mockedResolve = resolveBackendForConversation as jest.Mock;
const getState = () =>
  ({ apiConfig: { activeServer: "production" } }) as unknown as RootState;

beforeEach(() => {
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
