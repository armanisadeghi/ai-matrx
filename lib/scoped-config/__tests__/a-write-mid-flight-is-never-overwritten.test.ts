/** @jest-environment node */
//
// 🚨 A FETCH THAT STARTED BEFORE A WRITE MUST NOT OUTLIVE IT.
//
// THE DEFECT THIS PINS (found by Cursor Bugbot on PR 238, 2026-09-20, before
// it ever ran). The client reads ALL settings as one `platform.knob_snapshot`
// and answers every consumer from that one cached answer. Invalidation drops
// the cache — but dropping a Map does nothing to a request already on the
// wire. The sequence:
//
//   1. A screen mounts and asks for the snapshot. The request leaves.
//   2. The person saves a setting. `setKnobOverride` invalidates; the cache is
//      now empty and every reader will re-ask.
//   3. The request from step 1 lands, carrying the register as it was BEFORE
//      the save, and writes itself into the cache.
//   4. `useEffectiveKnob` now sees a defined value, so its effect does not
//      re-run. The person is shown the setting they just changed away from,
//      for a whole 60-second TTL, with nothing on the screen saying why.
//
// Step 4 is what makes it worse than a slow read: the stale answer does not
// merely arrive, it SUPPRESSES the correct one. And the same shape covers a
// write from another tab or from the server, which reach this module through
// the `settings_changed` directive and the same invalidation.
//
// THE FIX THIS PROVES: a generation counter that every invalidation bumps. A
// fetch reads it before asking and again when the answer lands; if it moved,
// the answer is historical and is never cached — the fetch asks again.

import { createClient } from "@/utils/supabase/client";

import { ensureKnobSnapshot, invalidateEffectiveKnob, peekEffectiveKnob } from "../effectiveKnobs";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({
  registerDirectiveHandler: jest.fn(),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = "ui.detail.presentation_by_type";

/**
 * A snapshot RPC whose answers are handed back one at a time, so a test can
 * hold a request open across an invalidation — which is the only way to
 * reproduce the race deterministically.
 */
function deferrable(values: unknown[]) {
  const resolvers: ((v: unknown) => void)[] = [];
  let asked = 0;
  const rpc = (fn: string) => {
    if (fn !== "knob_snapshot") throw new Error(`unexpected rpc ${fn}`);
    const index = asked;
    asked += 1;
    return new Promise((resolve) => {
      resolvers[index] = () =>
        resolve({
          data: { resolved: { [KEY]: values[index] }, stamp: `stamp-${index}` },
          error: null,
        });
    });
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);
  return {
    land: (index: number) => {
      const resolve = resolvers[index];
      if (!resolve) throw new Error(`request ${index} was never made`);
      resolve(undefined as never);
    },
    asked: () => asked,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateEffectiveKnob();
});

it("never caches an answer that predates an invalidation", async () => {
  // The first request carries the OLD value, the second the saved one.
  const rpc = deferrable(["docked", "page"]);

  const inFlight = ensureKnobSnapshot(ORG, USER, undefined);
  expect(rpc.asked()).toBe(1);

  // The person saves. The cache is dropped while request 0 is still open.
  invalidateEffectiveKnob(KEY);

  // Request 0 lands, carrying the pre-save register. It must NOT be installed.
  rpc.land(0);
  // Let the fetch's own continuation run: it compares the generation, discards
  // the historical answer and issues the next request.
  await new Promise((resolve) => setImmediate(resolve));

  // The fetch re-asks rather than caching what it has.
  expect(rpc.asked()).toBe(2);
  rpc.land(1);
  const snapshot = await inFlight;

  expect(snapshot.resolved[KEY]).toBe("page");
  expect(peekEffectiveKnob(ORG, USER, KEY)).toBe("page");
});

it("caches normally when no write lands mid-flight", async () => {
  const rpc = deferrable(["docked"]);

  const inFlight = ensureKnobSnapshot(ORG, USER, undefined);
  rpc.land(0);
  const snapshot = await inFlight;

  // One request, cached, and no retry: the guard costs nothing when it is not
  // needed — a fix that made every read cost two round trips would undo the
  // whole point of the one-fetch design.
  expect(rpc.asked()).toBe(1);
  expect(snapshot.resolved[KEY]).toBe("docked");
  expect(peekEffectiveKnob(ORG, USER, KEY)).toBe("docked");
});

it("a reader arriving after the write does not join the pre-write request", async () => {
  const rpc = deferrable(["docked", "page", "page"]);

  void ensureKnobSnapshot(ORG, USER, undefined);
  invalidateEffectiveKnob(KEY);

  // The in-flight entry was dropped with the cache, so this reader opens its
  // own request instead of inheriting an answer that predates the save.
  void ensureKnobSnapshot(ORG, USER, undefined);
  expect(rpc.asked()).toBe(2);
});
