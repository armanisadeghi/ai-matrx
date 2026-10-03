/**
 * Production, 2026-10-02: `users.user_preferences` select/update captured as
 * "AbortError: signal is aborted without reason". The abort came from
 * `BroadcastChannel.onmessage → dispatch → remoteWrite.schedule`: a change
 * ANOTHER tab broadcast was re-saved by this tab, and that re-save aborted this
 * tab's own in-flight save with a bare `.abort()`.
 *
 * Guards:
 *  1. A peer's broadcast never schedules a save here and never aborts an
 *     in-flight one (the peer saves its own change).
 *  2. A save waiting on its debounce still stores the post-broadcast body.
 *  3. Every engine abort is NAMED (never "without reason"), and the
 *     superseding save actually goes out with the newer body.
 *  4. The Supabase capture files nothing for a named caller abort even where
 *     it never saw the signal; a timeout still files.
 */

import "fake-indexeddb/auto";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { definePolicy } from "../policies/define";
import { createSyncMiddleware } from "../engine/middleware";
import { createRemoteWriteScheduler } from "../engine/remoteWrite";
import { clearAll, readSlice } from "../persistence/idb";
import type { SyncChannel } from "../channel";
import type { IdentityKey } from "../types";
import type { SyncMessage } from "../messages";
import {
  CALLER_ABORT_MARK,
  callerAbortReason,
} from "@/lib/diagnostics/cancelledByCaller";
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

const identity: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };
const FAST_DEBOUNCE = 20;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`not met within ${timeoutMs}ms`);
    await wait(10);
  }
}

function fakeChannel(): SyncChannel & { sent: SyncMessage[] } {
  const sent: SyncMessage[] = [];
  return {
    available: true,
    sent,
    post: (m) => void sent.push(m),
    subscribe: () => () => {},
    setIdentity: () => {},
    close: () => {},
  } as SyncChannel & { sent: SyncMessage[] };
}

interface Prefs {
  theme: string;
  density: string;
}

const slice = createSlice({
  name: "prefs",
  initialState: { theme: "light", density: "normal" } as Prefs,
  reducers: {
    setTheme: (s, a: { type: string; payload: string }) => {
      s.theme = a.payload;
    },
    setDensity: (s, a: { type: string; payload: string }) => {
      s.density = a.payload;
    },
  },
});

function makeStore(write: (ctx: { signal: AbortSignal; body: unknown }) => Promise<void>) {
  const policy = definePolicy<Prefs>({
    sliceName: "prefs",
    preset: "warm-cache",
    version: 1,
    broadcast: { actions: ["prefs/setTheme", "prefs/setDensity"] },
    remote: { write },
  });
  return configureStore({
    reducer: { prefs: slice.reducer },
    middleware: (gDM) =>
      gDM().concat(
        createSyncMiddleware({
          policies: [policy],
          channel: fakeChannel(),
          getIdentity: () => identity,
          defaultDebounceMs: FAST_DEBOUNCE,
        }),
      ),
  });
}

describe("a peer tab's broadcast is never re-saved here", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
  });

  it("does not abort this tab's in-flight save and does not write the peer's change again", async () => {
    const signals: AbortSignal[] = [];
    const bodies: Prefs[] = [];
    let release: (() => void) | undefined;
    const store = makeStore(async (ctx) => {
      signals.push(ctx.signal);
      bodies.push(ctx.body as Prefs);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    store.dispatch(slice.actions.setTheme("dark"));
    await waitUntil(() => signals.length === 1);

    // The peer tab changed density; it arrives here through the channel.
    store.dispatch({
      ...slice.actions.setDensity("compact"),
      meta: { fromBroadcast: true },
    });
    expect(store.getState().prefs.density).toBe("compact");
    expect(signals[0].aborted).toBe(false);

    release?.();
    await wait(FAST_DEBOUNCE + 80);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ theme: "dark", density: "normal" });
  });

  it("a save waiting on its debounce stores the post-broadcast body", async () => {
    const bodies: Prefs[] = [];
    const store = makeStore(async (ctx) => {
      bodies.push(ctx.body as Prefs);
    });

    store.dispatch(slice.actions.setTheme("dark"));
    store.dispatch({
      ...slice.actions.setDensity("compact"),
      meta: { fromBroadcast: true },
    });
    await waitUntil(() => bodies.length === 1);
    await wait(FAST_DEBOUNCE + 40);
    expect(bodies).toHaveLength(1);
    const record = await readSlice("auth:u1", "prefs", 1);
    expect(record?.body).toEqual({ theme: "dark", density: "compact" });
  });
});

describe("engine aborts are named and the superseding save goes out", () => {
  it("a newer body aborts the in-flight save WITH a reason, then saves the newer body", async () => {
    const signals: AbortSignal[] = [];
    const bodies: unknown[] = [];
    const releases: Array<() => void> = [];
    const policy = definePolicy<Prefs>({
      sliceName: "prefs",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["prefs/setTheme"] },
      remote: {
        write: async (ctx) => {
          signals.push(ctx.signal);
          bodies.push(ctx.body);
          await new Promise<void>((resolve) => releases.push(resolve));
        },
      },
    });
    const scheduler = createRemoteWriteScheduler({
      policies: [policy],
      store: { getState: () => ({}), dispatch: (a: unknown) => a } as never,
      getIdentity: () => identity,
      defaultDebounceMs: FAST_DEBOUNCE,
      attachPageHide: () => () => {},
    });
    try {
      scheduler.schedule("prefs", { theme: "dark", density: "normal" });
      await waitUntil(() => signals.length === 1);
      scheduler.schedule("prefs", { theme: "dark", density: "compact" });

      expect(signals[0].aborted).toBe(true);
      const reason = signals[0].reason as DOMException;
      expect(reason.name).toBe("AbortError");
      expect(reason.message).toContain(CALLER_ABORT_MARK);
      expect(reason.message).not.toMatch(/without reason/);

      releases[0]();
      await waitUntil(() => signals.length === 2);
      expect(bodies[1]).toEqual({ theme: "dark", density: "compact" });
      expect(signals[1].aborted).toBe(false);
      releases[1]();
    } finally {
      scheduler.dispose();
    }
  });
});

describe("the Supabase capture never files a named caller abort", () => {
  beforeEach(() => clearCapturedErrors());

  function answering(result: unknown) {
    return wrapClientForCapture({
      schema: (_s: string) => ({
        from: (_r: string) => ({
          then(onFulfilled: (value: unknown) => unknown) {
            return Promise.resolve(onFulfilled(result));
          },
        }),
      }),
    });
  }

  it("files nothing for a named abort even where the chain never saw the signal", async () => {
    const reason = callerAbortReason("superseded by a newer save");
    // postgrest-js: `${err.name}: ${err.message}`.
    const message = `${reason.name}: ${reason.message}`;
    await answering({
      data: null,
      error: {
        code: "",
        message,
        details: message,
        hint: "Request was aborted (timeout or manual cancellation)",
      },
      status: 0,
    }).schema("users").from("user_preferences");
    expect(getSnapshot()).toHaveLength(0);
  });

  it("still files an unnamed abort it cannot attribute to the caller", async () => {
    await answering({
      data: null,
      error: {
        code: "",
        message: "AbortError: signal is aborted without reason",
        hint: "Request was aborted (timeout or manual cancellation)",
      },
      status: 0,
    }).schema("users").from("user_preferences");
    expect(getSnapshot()).toHaveLength(1);
  });
});
