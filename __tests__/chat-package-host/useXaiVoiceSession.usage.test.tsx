/**
 * The xAI realtime voice session is browser-held, so its spend never touches the server unless THIS
 * hook reports it. Each `response.done` carries xAI's own usage; the session reports it (under xAI's
 * response id) through the real host reporter to `POST /broker/usage`, retrying a failed send
 * with the SAME usage id so the server bills it once.
 *
 * Seam: the real `useXaiVoiceSession` -> the real `reportBrowserProviderUsage` (queue + retry) ->
 * the real `reportProviderSessionUsage` -> a faked transport `fetch`. Faked: the xAI socket, mic,
 * speaker, token mint, HTTP transport.
 *
 * Breaks this catches: usage never reported; the response id not the usage id; tokens dropped;
 * a failed send lost instead of retried; a retry that changes the usage id (double bill).
 */

import * as React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, settle } from "@ai-matrx/chat/testing/render-hook";
import voiceAgentReducer, {
  applyAgentConfig,
  initInstance,
} from "@ai-matrx/chat/voice-agent/state/voiceAgentSlice";
import type { XaiClient, XaiClientError } from "@ai-matrx/chat/voice-agent/transport/xaiClient";

type XaiServerEvent = Parameters<Parameters<XaiClient["onEvent"]>[0]>[0];
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
  onEvent: [] as ((event: XaiServerEvent) => void)[],
};
jest.mock("@ai-matrx/chat/voice-agent/transport/xaiClient", () => ({
  createXaiClient: (): XaiClient => ({
    connect: async () => undefined,
    sendInputAudio: () => undefined,
    cancelResponse: () => undefined,
    sendRaw: () => undefined,
    disconnect: () => undefined,
    onEvent: (cb) => {
      socket.onEvent.push(cb);
      return () => {
        socket.onEvent = socket.onEvent.filter((h) => h !== cb);
      };
    },
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
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { setStoreSingleton } from "@/lib/redux/store-singleton";
import { flushBrowserProviderUsage } from "@host/lib/api/provider-session-failure";

// Server calls reach the host's server client through the server port (P9).
beforeAll(() => {
  // The seam under test is this app's own report (behind the server port).
  configureServerForTest({
    reportBrowserProviderUsage: jest.requireActual("@host/lib/api/provider-session-failure")
      .reportBrowserProviderUsage,
  });
});



const INSTANCE = "chat-voice-main";
const MODEL = "grok-voice-latest";

function makeStore() {
  const store = configureStore({
    reducer: {
      voiceAgent: voiceAgentReducer,
      appContext: (state = { organization_id: "3f6b2c1e-8a4d-4e7f-9b2c-5d1a7e3f9c48" }) => state,
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
  // The reporter rides the runtime store singleton, as it does in the app.
  setStoreSingleton(store);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const h = await renderHook(() => useXaiVoiceSession({ instanceId: INSTANCE }), { wrapper });
  await h.act(async () => {
    h.current.toggle();
  });
  await settle(h, () => socket.onEvent.length > 0, "the hook subscribed to socket events");
  return { h, store };
}

function fire(event: XaiServerEvent) {
  for (const handler of [...socket.onEvent]) handler(event);
}

function usageBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([path]) => path === "/broker/usage")
    .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);
}

const receipt = () =>
  new Response(JSON.stringify({ billed: true, duplicate: false, cost_usd: 0.002 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  fetchMock.mockReset();
  socket.onError = [];
  socket.onEvent = [];
});

describe("useXaiVoiceSession usage reporting", () => {
  it("reports each response's xAI usage under xAI's response id", async () => {
    fetchMock.mockImplementation(async () => receipt());
    const { h, store } = await startSession();
    await h.act(async () => {
      fire({ type: "session.created", session: { id: "sess_1", model: MODEL } });
      fire({
        type: "response.done",
        response: { id: "resp_a", usage: { input_tokens: 420, output_tokens: 130, total_tokens: 550 } },
      });
    });
    await flushBrowserProviderUsage();
    const bodies = usageBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      provider: "xai",
      model: MODEL,
      usage_id: "resp_a",
      input_tokens: 420,
      output_tokens: 130,
    });
    expect(store.getState().voiceAgent).toBeDefined();
    await h.unmount();
  });

  it("a failed send is retried with the same usage id until the server has it", async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(new Response("down", { status: 503 }))
        .mockResolvedValueOnce(new Response("down", { status: 503 }))
        .mockImplementation(async () => receipt());
      const { h } = await startSession();
      await h.act(async () => {
        fire({ type: "response.done", response: { id: "resp_retry", usage: { input_tokens: 10, output_tokens: 5 } } });
      });
      await jest.advanceTimersByTimeAsync(10_000);
      await flushBrowserProviderUsage();
      const bodies = usageBodies();
      expect(bodies.length).toBe(3);
      expect(new Set(bodies.map((b) => b.usage_id))).toEqual(new Set(["resp_retry"]));
      await h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
