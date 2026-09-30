/**
 * A media-desk run survives the page: the run id is remembered when the server
 * claims it, and the next open follows the stored `seo.collection_run` row to
 * its result (or its failure) instead of losing a minutes-long clip or draft.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows: Array<{ status: string; result: unknown; error: unknown } | null> = [];
jest.mock("@/utils/supabase/webDb", () => ({ requireAuthenticatedSupabaseSession: jest.fn(async () => undefined) }));
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows.shift() ?? null, error: null }) }) }),
      }),
    }),
  },
}));

import { REJOIN_WINDOW_MS, readRememberedRun, rememberRun, useRejoinRun, type RejoinHandle } from "../rejoin";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  sessionStorage.clear();
  rows.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

let seen: RejoinHandle<{ ok: boolean }> | null = null;
function Probe({ active }: { active: boolean }) {
  seen = useRejoinRun<{ ok: boolean }>("clip:site:link", active);
  return null;
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(4_100);
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("remembers a run and forgets it past the window", () => {
  rememberRun("k", "run-1", 1_000);
  expect(readRememberedRun("k", 2_000)).toEqual({ runId: "run-1", startedAt: 1_000 });
  expect(readRememberedRun("k", 1_000 + REJOIN_WINDOW_MS + 1)).toBeNull();
  expect(readRememberedRun("k", 2_000)).toBeNull();
});

it("follows a remembered run until it completes, then shows the stored result and forgets the run", async () => {
  rememberRun("clip:site:link", "run-7");
  rows.push({ status: "processing", result: null, error: null }, { status: "completed", result: { ok: true }, error: null });
  act(() => root.render(<Probe active />));
  expect(seen?.following?.runId).toBe("run-7");
  await flush();
  expect(seen?.result).toBeNull();
  await flush();
  expect(seen?.result).toEqual({ ok: true });
  expect(seen?.following).toBeNull();
  expect(readRememberedRun("clip:site:link")).toBeNull();
});

it("says so when the run failed on the server", async () => {
  rememberRun("clip:site:link", "run-8");
  rows.push({ status: "failed", result: null, error: { message: "The browser could not render it." } });
  act(() => root.render(<Probe active />));
  await flush();
  expect(seen?.error).toBe("The browser could not render it.");
});

it("does nothing while inactive or with no remembered run", async () => {
  act(() => root.render(<Probe active={false} />));
  rememberRun("clip:site:link", "run-9");
  await flush();
  expect(seen?.following).toBeNull();
  sessionStorage.clear();
  act(() => root.render(<Probe active />));
  await flush();
  expect(seen?.following).toBeNull();
});
