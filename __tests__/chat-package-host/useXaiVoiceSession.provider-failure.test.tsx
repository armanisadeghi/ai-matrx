/**
 * The xAI realtime voice session is browser-held: the browser talks to xAI
 * directly on an ephemeral token, so an xAI refusal (the platform's account is
 * out of credit) never reaches the server unless THIS hook reports it. The
 * person must see the server's sentence, never xAI's raw text.
 *
 * Seam: the real `useXaiVoiceSession` → the real `reportBrowserProviderFailure`
 * thunk → the real `reportProviderSessionFailure` (`@ai-matrx/agents/matrx`,
 * which bounds the body) → a faked transport `fetch`. Faked are only what the
 * hook CALLS at the edge: the xAI socket client, the mic/speaker modules, the
 * token mint, and the HTTP transport.
 *
 * Breaks this catches: the error handler not reporting; the report missing the
 * provider / model / provider code; an unbounded body; the verdict ignored (raw
 * xAI text shown); one handshake failure reported once per socket error.
 */

import * as React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, settle } from "@ai-matrx/chat/host/__tests__/render-hook";
import voiceAgentReducer, {
  applyAgentConfig,
  initInstance,
} from "@ai-matrx/chat/voice-agent/state/voiceAgentSlice";
import type { XaiClient, XaiClientError } from "@ai-matrx/chat/voice-agent/transport/xaiClient";
import type { AudioCaptureHandle } from "@ai-matrx/chat/voice-agent/audio/audioCapture";
import type { AudioPlaybackHandle } from "@ai-matrx/chat/voice-agent/audio/audioPlayback";
import type { TokenManager } from "@ai-matrx/chat/voice-agent/transport/tokenManager";

const fetchMock = jest.fn<Promise<Response>, [string, { body?: string }]>();

jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: () => ({
    fetch: (path: string, init: { body?: string }) => fetchMock(path, init),
  }),
}));
jest.mock("@/lib/api/call-api", () => ({
  waitForAuthReady: jest.fn(async () => undefined),
}));

// The xAI socket — the provider edge. Records the error handlers the hook installs.
const socket = {
  onError: [] as ((err: XaiClientError) => void)[],
};
jest.mock("@ai-matrx/chat/voice-agent/transport/xaiClient", () => ({
  createXaiClient: (): XaiClient => ({
    connect: async () => undefined,
    sendInputAudio: () => undefined,
    cancelResponse: () => undefined,
    sendRaw: () => undefined,
    disconnect: () => undefined,
    onEvent: () => () => undefined,
    onError: (cb) => {
      socket.onError.push(cb);
      return () => {
        socket.onError = socket.onError.filter((h) => h !== cb);
      };
    },
    onClose: () => () => undefined,
    isStreamingReady: () => false,
    isOpen: () => false,
  }),
}));
jest.mock("@ai-matrx/chat/voice-agent/audio/audioCapture", () => ({
  createAudioCapture: (): AudioCaptureHandle => ({
    warmupSync: () => undefined,
    start: async () => undefined,
    setLive: () => undefined,
    stop: async () => undefined,
    onError: () => () => undefined,
    isActive: () => true,
    getStats: () => ({
      framesCaptured: 0,
      framesSent: 0,
      framesBuffered: 0,
      lastRms: 0,
      lastFrameAt: null,
      ctxState: "running",
      processCalls: 0,
      hasInput: false,
    }),
    setMuted: () => undefined,
    isMuted: () => false,
  }),
}));
jest.mock("@ai-matrx/chat/voice-agent/audio/audioPlayback", () => ({
  createAudioPlayback: (): AudioPlaybackHandle => ({
    warmupSync: () => undefined,
    enqueue: () => undefined,
    interrupt: () => 0,
    markTurnEnded: () => 0,
    getTurnElapsedMs: () => 0,
    onIdle: () => () => undefined,
    stop: async () => undefined,
  }),
}));
jest.mock("@ai-matrx/chat/voice-agent/transport/tokenManager", () => ({
  createTokenManager: (): TokenManager => ({
    prime: async () => undefined,
    getCurrent: async () => "xai-ephemeral-secret",
    getCurrentCredential: async () => ({
      token: "xai-ephemeral-secret",
      endpoint: "wss://api.x.ai/v1/realtime",
    }),
    peek: () => "xai-ephemeral-secret",
    expiresAt: () => null,
    invalidate: () => undefined,
    onError: () => () => undefined,
    dispose: () => undefined,
  }),
}));

import { useXaiVoiceSession } from "@ai-matrx/chat/voice-agent/hooks/useXaiVoiceSession";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";

// Server calls reach the host's server client through the server port (P9).
beforeAll(() => {
  // The seam under test is this app's own report (behind the server port).
  configureServerForTest({
    reportBrowserProviderFailure: jest.requireActual("@host/lib/api/provider-session-failure")
      .reportBrowserProviderFailure,
  });
});


const INSTANCE = "chat-voice-main";
const ORG = "3f6b2c1e-8a4d-4e7f-9b2c-5d1a7e3f9c48";
const MODEL = "grok-voice-latest";

/** What `POST /broker/provider-failures` answers for an out-of-credit xAI account. */
const OUT_OF_CREDIT = {
  error_type: "insufficient_credit",
  retryable: false,
  user_message: "Voice is paused for this workspace — the voice provider account is out of credit.",
};

/** xAI's own words — reported verbatim, never shown. */
const XAI_TEXT =
  "Your team 7c2e has run out of credits. Purchase more at console.x.ai to continue using the API.";

function makeStore() {
  const store = configureStore({
    reducer: {
      voiceAgent: voiceAgentReducer,
      appContext: (state = { organization_id: ORG }) => state,
      userAuth: (state = { id: "a1b2c3d4-0000-4000-8000-000000000001" }) => state,
    },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    initInstance({
      instanceId: INSTANCE,
      voiceId: "ara",
      instructions: "You are the front-desk voice for Harbor Dental. Book cleanings and answer insurance questions.",
      tools: [],
      preset: "intro",
      persist: false,
    } as Parameters<typeof initInstance>[0]),
  );
  store.dispatch(applyAgentConfig({ instanceId: INSTANCE, realtimeModel: MODEL }));
  return store;
}

async function startSession() {
  const store = makeStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const h = await renderHook(() => useXaiVoiceSession({ instanceId: INSTANCE }), { wrapper });
  await h.act(async () => {
    h.current.toggle();
  });
  await settle(h, () => socket.onError.length > 0, "the hook subscribed to socket errors");
  return h;
}

function fireSocketError(err: XaiClientError) {
  for (const handler of [...socket.onError]) handler(err);
}

function postedBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([path]) => path === "/broker/provider-failures")
    .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);
}

beforeEach(() => {
  fetchMock.mockReset();
  socket.onError = [];
});

describe("useXaiVoiceSession provider failures", () => {
  it("an xAI server error is reported (bounded) and the person sees the server's sentence", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(OUT_OF_CREDIT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const h = await startSession();
    // xAI sometimes echoes the whole rejected session config after its sentence.
    const echoedConfig = ` request=${JSON.stringify({ instructions: "x".repeat(4200) })}`;
    await h.act(async () => {
      fireSocketError({
        code: "server-error",
        message: "xAI realtime error",
        providerCode: "insufficient_credits",
        providerMessage: XAI_TEXT + echoedConfig,
      });
    });
    await settle(h, () => h.current.error !== null && h.current.error.message !== "", "error shown");

    const bodies = postedBodies();
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(body.provider).toBe("xai");
    expect(body.model).toBe(MODEL);
    expect(body.error_type).toBe("insufficient_credits");
    // Bounded exactly as the server model bounds it (4000), xAI's sentence first.
    expect(String(body.message)).toHaveLength(4000);
    expect(String(body.message).startsWith(XAI_TEXT)).toBe(true);

    expect(h.current.error).toEqual({
      code: "ws-server-error",
      message: OUT_OF_CREDIT.user_message,
    });
    expect(h.current.status).toBe("error");
    await h.unmount();
  });

  it("when the report itself fails, the session's own message shows — never xAI's raw text", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "internal_error", message: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = await startSession();
    await h.act(async () => {
      fireSocketError({
        code: "connect-failed",
        message: "Couldn't reach the voice service. Check your connection and tap the mic again.",
        providerMessage: XAI_TEXT,
      });
    });
    await settle(h, () => h.current.error !== null, "fallback error shown");
    expect(postedBodies()).toHaveLength(1);
    expect(h.current.error).toEqual({
      code: "ws-connect-failed",
      message: "Couldn't reach the voice service. Check your connection and tap the mic again.",
    });
    warn.mockRestore();
    await h.unmount();
  });

  it("one failed handshake fires several socket errors but is reported once", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(OUT_OF_CREDIT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const h = await startSession();
    await h.act(async () => {
      fireSocketError({ code: "auth-failed", message: "Voice sign-in was refused.", closeCode: 4001 });
      fireSocketError({ code: "transport-closed", message: "Voice connection closed." });
    });
    await settle(h, () => h.current.error?.message === OUT_OF_CREDIT.user_message, "verdict shown");
    expect(postedBodies()).toHaveLength(1);
    expect(postedBodies()[0]!.message).toBe("Voice sign-in was refused.");
    await h.unmount();
  });
});
