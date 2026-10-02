/**
 * Browser-held Cartesia sessions report provider failures to the server and
 * show the server's sentence — never Cartesia's raw text.
 *
 * Only the transport's `fetch` is faked: the real `reportProviderSessionFailure`
 * (`@ai-matrx/agents/matrx`), the real glue thunk and the real connection
 * funnel run, so a broken wire (wrong path, wrong body, verdict ignored) fails.
 */

import { connectCartesiaTts } from "@/lib/cartesia/connection";
import { ProviderSessionError } from "@/lib/api/provider-session-failure";

const fetchMock = jest.fn<Promise<Response>, [string, { body?: string }]>();

jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: () => ({
    fetch: (path: string, init: { body?: string }) => fetchMock(path, init),
  }),
}));
jest.mock("@/lib/api/call-api", () => ({
  waitForAuthReady: jest.fn(async () => undefined),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: jest.fn(), getState: () => ({}) }),
}));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));
jest.mock("@/lib/cartesia/accessToken", () => ({
  getCartesiaAccessToken: jest.fn(async () => "ephemeral-token"),
  invalidateCartesiaAccessToken: jest.fn(),
  isCartesiaAuthError: () => false,
}));

type EventHandler = (event: Record<string, unknown>) => void;
const nativeSocket = {
  connect: jest.fn<Promise<void>, []>(),
  handlers: new Map<string, EventHandler>(),
  on(name: string, handler: EventHandler) {
    this.handlers.set(name, handler);
  },
  send: jest.fn(async () => undefined),
  close: jest.fn(),
  socket: { addEventListener: jest.fn() },
};
jest.mock("@cartesia/cartesia-js/client", () => ({
  Cartesia: jest.fn().mockImplementation(() => ({
    tts: { websocket: jest.fn(async () => nativeSocket) },
  })),
}));

const OUT_OF_CREDIT = {
  error_type: "insufficient_credit",
  retryable: false,
  user_message: "Speech is paused for this workspace. Try again later.",
};

function verdictResponse(): Response {
  return new Response(JSON.stringify(OUT_OF_CREDIT), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  toastError.mockReset();
  nativeSocket.connect.mockReset();
  nativeSocket.send.mockClear();
  nativeSocket.handlers.clear();
});

describe("Cartesia provider failures", () => {
  it("a refused handshake is reported and surfaces the server's sentence", async () => {
    nativeSocket.connect.mockRejectedValue(
      new Error("Unexpected server response: 402 Payment Required"),
    );
    fetchMock.mockResolvedValue(verdictResponse());

    const failure = connectCartesiaTts();
    await expect(failure).rejects.toBeInstanceOf(ProviderSessionError);
    await expect(failure).rejects.toMatchObject({
      message: OUT_OF_CREDIT.user_message,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/broker/provider-failures");
    expect(JSON.parse(init.body ?? "{}")).toEqual({
      provider: "cartesia",
      status_code: 402,
      message: "Unexpected server response: 402 Payment Required",
    });
  });

  it("falls back to the session's own message when the report fails", async () => {
    nativeSocket.connect.mockRejectedValue(new Event("error"));
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(connectCartesiaTts()).rejects.toMatchObject({
      message: "Could not connect to the speech service.",
      retryable: true,
    });
    warn.mockRestore();
  });

  it("an in-stream provider error is reported, shown, and stops the socket", async () => {
    nativeSocket.connect.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(verdictResponse());

    const { ws } = await connectCartesiaTts();
    const response = await ws.send({
      modelId: "sonic",
      transcript: "Hello",
      voice: { mode: "id", id: "voice-1" },
      contextId: "ctx-1",
    });
    const messages: string[] = [];
    response.on("message", (m) => messages.push(m));

    nativeSocket.handlers.get("event")?.({
      type: "error",
      context_id: "ctx-1",
      status_code: 402,
      error_code: "insufficient_credits",
      title: "Payment Required",
      message: "Your account has run out of credits.",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body ?? "{}")).toEqual({
      provider: "cartesia",
      status_code: 402,
      error_type: "insufficient_credits",
      message: "Your account has run out of credits.",
    });
    expect(toastError).toHaveBeenCalledWith("Speech stopped", {
      description: OUT_OF_CREDIT.user_message,
    });
    expect(JSON.parse(messages[0])).toMatchObject({
      type: "error",
      message: OUT_OF_CREDIT.user_message,
      retryable: false,
    });
    // Not retryable → the socket refuses further requests instead of the SDK
    // reconnecting and asking the provider again.
    await expect(
      ws.send({
        modelId: "sonic",
        transcript: "Again",
        voice: { mode: "id", id: "voice-1" },
      }),
    ).rejects.toMatchObject({ message: OUT_OF_CREDIT.user_message });
  });
});
