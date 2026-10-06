/**
 * Every way a media-desk run can end reaches the dialog as the result or ONE sentence in the
 * server's words — never a spinner, never "no result". The usage-limit refusal is simulated on
 * each path: an in-band stream error frame, a planned command failure, an HTTP refusal, and a
 * stream that closed early (followed to the stored run row).
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/utils/supabase/webDb", () => ({ requireAuthenticatedSupabaseSession: jest.fn(async () => undefined) }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";
import { consume } from "../api";
import { publishedDate } from "../ClipView";
import { followRunToEnd, rememberRun, useOpenIfRemembered } from "../rejoin";

const USAGE = "Writing headlines stopped: Headline Generator could not finish this job: You've reached your AI usage limit for now. Upgrade your plan to keep going.";

type Frame = { event: string; data: unknown };

/** A dispatch that plays the given frames into the consumer's handler, then resolves `outcome`. */
function play(frames: Frame[], outcome: { error?: { message?: string } } = {}) {
  const dispatch = (async (thunk: unknown) => thunk) as unknown as AppDispatch;
  const run = ((onEvent: (e: TypedStreamEvent) => void) => {
    for (const f of frames) onEvent(f as unknown as TypedStreamEvent);
    return outcome;
  }) as unknown as Parameters<typeof consume>[1];
  return { dispatch, run };
}

const claimed: Frame = { event: "data", data: { kind: "seo.command_run", run_id: "run-1" } };

describe("consume", () => {
  it("a stream error frame (an unplanned server crash) reaches the dialog in the server's words", async () => {
    const { dispatch, run } = play([claimed, { event: "error", data: { message: USAGE, user_message: "SeoPressHeadlines failed unexpectedly" } }]);
    await expect(consume(dispatch, run, "seo.press_headlines_completed", "Writing headlines", {}, { followRun: jest.fn() })).rejects.toThrow(USAGE);
  });

  it("a planned command failure (the usage limit) reaches the dialog as its sentence", async () => {
    const { dispatch, run } = play([claimed, { event: "data", data: { kind: "seo.command_failed", error: { message: USAGE } } }]);
    await expect(consume(dispatch, run, "seo.press_headlines_completed", "Writing headlines", {})).rejects.toThrow(USAGE);
  });

  it("an HTTP refusal before the stream reaches the dialog as its message", async () => {
    const { dispatch, run } = play([], { error: { message: "You've reached your AI usage limit for now. Upgrade your plan to keep going." } });
    await expect(consume(dispatch, run, "x", "Making the clip", {})).rejects.toThrow("You've reached your AI usage limit");
  });

  it("a stream that closed early follows the saved run to its stored result", async () => {
    const { dispatch, run } = play([claimed]);
    const followRun = jest.fn(async () => ({ ok: true }));
    await expect(consume(dispatch, run, "x", "Making the clip", {}, { followRun })).resolves.toEqual({ ok: true });
    expect(followRun).toHaveBeenCalledWith("run-1");
  });

  it("a stream that closed early surfaces the saved run's stored reason", async () => {
    const { dispatch, run } = play([claimed]);
    const followRun = jest.fn(async () => {
      throw new Error(USAGE);
    });
    await expect(consume(dispatch, run, "x", "Drafting", {}, { followRun })).rejects.toThrow(USAGE);
  });

  it("a stream that ended before the server started the job says so, never 'no result'", async () => {
    const { dispatch, run } = play([]);
    await expect(consume(dispatch, run, "x", "Writing headlines", {})).rejects.toThrow("ended before the server started it");
  });
});

describe("followRunToEnd", () => {
  const sleep = async () => undefined;
  it("returns the stored result, the stored reason, or says it is still running", async () => {
    const reads = [{ status: "processing", result: null, error: null }, { status: "completed", result: { ok: 1 }, error: null }];
    await expect(followRunToEnd("r", { read: async () => reads.shift()!, sleep })).resolves.toEqual({ ok: 1 });
    await expect(
      followRunToEnd("r", { read: async () => ({ status: "failed", result: null, error: { type: "MandateError", message: USAGE } }), sleep }),
    ).rejects.toThrow(USAGE);
    await expect(followRunToEnd("r", { read: async () => ({ status: "processing", result: null, error: null }), sleep, limitMs: 8_000 })).rejects.toThrow(
      "still working on the server",
    );
  });
});

describe("publishedDate", () => {
  it("shows the full date, never a cut string", () => {
    expect(publishedDate("September 02, 2026")).toBe("September 2, 2026");
    expect(publishedDate("2026-09-02")).toBe("September 2, 2026");
    expect(publishedDate("Tuesday, early edition")).toBe("Tuesday, early edition");
  });
});

describe("useOpenIfRemembered", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  function Probe({ k, onOpen }: { k: string; onOpen: (v: boolean) => void }) {
    useOpenIfRemembered(k, onOpen);
    return null;
  }

  it("opens a dialog whose run is still out there after a reload, and not otherwise", () => {
    const open = jest.fn();
    act(() => root.render(<Probe k="clip:s:link" onOpen={open} />));
    expect(open).not.toHaveBeenCalled();
    act(() => root.unmount());
    rememberRun("clip:s:link", "run-2");
    root = createRoot(container);
    act(() => root.render(<Probe k="clip:s:link" onOpen={open} />));
    expect(open).toHaveBeenCalledWith(true);
  });
});
