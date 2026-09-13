/**
 * THE TIMELINE LANE HAS ITS OWN DURABLE-RUN POINTER (Bugbot HIGH, 2026-09-13).
 *
 * `useMasterworkRun` keys the browser-side run receipt by
 * `${surface}:${rulebookId}` — that is the whole reason `timeline` is a
 * declared surface with its own measured expectation. `IngestSourceDialog`
 * folds the timeline lane into the "add rules from a source" dialog, and it
 * launched EVERY lane as `surface: "ingest"`. One Rulebook's case distillation
 * and its pasted-chapter distillation therefore wrote the same pointer: a
 * reload could reopen the wrong lane, and a fresh ingest could rejoin the
 * timeline run and report its answer as its own.
 *
 * These tests drive the REAL dialog and read the options it hands the durable
 * run. Put `surface: "ingest"` back for the timeline lane and the first two
 * fail.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { IngestSourceDialog } from "../IngestSourceDialog";
import type { IngestLane } from "../../../browse/approachLane";
import type { Rulebook } from "../../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no `matchMedia`; the textarea's context menu asks for it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom has no ResizeObserver; the textarea's stats bar measures itself.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  NoopResizeObserver;

type RunOptions = { surface: string; path: string; rulebookId: string };

const seen: RunOptions[] = [];
jest.mock("../../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: (options: RunOptions) => {
    seen.push({
      surface: options.surface,
      path: options.path,
      rulebookId: options.rulebookId,
    });
    return {
      running: false,
      stages: [],
      result: null,
      status: "idle",
      error: null,
      launch: jest.fn(),
      reset: jest.fn(),
      fail: jest.fn(),
      retry: jest.fn(),
    };
  },
}));

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: jest.fn() }),
}));

// `ProTextarea` reaches for the store (its AI post-process assist). The
// dialog's own behaviour under test needs none of it.
jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ dispatch: jest.fn(), getState: () => ({}) }),
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const RULEBOOK = {
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: "55555555-5555-4555-8555-555555555555",
  name: "Fix — sources",
} as unknown as Rulebook;

let container: HTMLDivElement;
let root: Root;

async function mountLane(lane: IngestLane): Promise<RunOptions> {
  seen.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <IngestSourceDialog
          open
          onOpenChange={() => {}}
          rulebook={RULEBOOK}
          initialLane={lane}
        />
      </TooltipProvider>,
    );
  });
  const last = seen.at(-1);
  if (!last) throw new Error("the dialog never asked for a durable run");
  return last;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("IngestSourceDialog — which durable-run pointer each lane writes", () => {
  it("launches a case on the timeline surface, not the ingest one", async () => {
    const options = await mountLane("timeline");
    expect(options.surface).toBe("timeline");
    expect(options.path).toBe("/masterworks/ingest-timeline");
  });

  it("keeps the timeline pointer separate from the ingest pointer", async () => {
    const timeline = await mountLane("timeline");
    act(() => root.unmount());
    container.remove();
    const source = await mountLane("source");

    expect(`${timeline.surface}:${timeline.rulebookId}`).not.toBe(
      `${source.surface}:${source.rulebookId}`,
    );
  });

  it("launches a pasted source on the ingest surface", async () => {
    const options = await mountLane("source");
    expect(options.surface).toBe("ingest");
    expect(options.path).toBe("/masterworks/ingest");
  });

  it("launches an uploaded file on the ingest surface — one dialog, one pointer", async () => {
    const options = await mountLane("file");
    expect(options.surface).toBe("ingest");
    expect(options.path).toBe("/masterworks/ingest-file");
  });
});
