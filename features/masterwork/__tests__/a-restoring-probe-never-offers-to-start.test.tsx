/**
 * A RESTORING PROBE NEVER OFFERS TO START.
 *
 * 🚨 THE DEFECT (cold walk 5, finding 3, 2026-09-16). Reloading the Bad Example
 * probe mid-round-2 painted, in ONE frame and for about nine seconds:
 *
 *   * the SETUP screen — a spinning, disabled "Write the first one" button over
 *     the "Up to 5 rounds…" helper text; and, directly below it,
 *   * an in-progress row reading "Writing round 2 — a version of this work that
 *     looks right and is not." with its own Stop button.
 *
 * A fresh-start prompt and a live round, at the same time, on one screen. It
 * settled correctly with no data loss — which is exactly why it is worth
 * guarding: a first-timer refreshing mid-round reasonably concludes something
 * broke, and nothing on screen says otherwise.
 *
 * THE ROOT CAUSE: `started` is answered by the RESTORED CONTENT, which only
 * arrives when the rejoin resolves, while `running` is true from the first
 * paint (the durable hook enters `rejoining` synchronously). The two answers
 * disagree for exactly as long as the rejoin takes. The missing third answer —
 * "there is a run here and this mount cannot describe it yet" — is now
 * `restoring` on the shared `useDurableRun` handle, so every durable surface
 * has it, not just this one.
 *
 * THE FORCING FUNCTION: the REAL component, mounted against a durable pointer
 * whose rejoin NEVER RESOLVES — which is the nine-second window held open
 * forever. The setup screen must not be on screen in that window.
 *
 * RED against the pre-fix component: "Write the first one" and the round row
 * are both present.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => undefined,
  useAppStore: () => ({ dispatch: mockDispatch, getState: () => ({}) }),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => request,
}));

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: async () => 5,
  knobBool: async () => true,
}));

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/features/masterwork/components/AgentCredit", () => ({
  AgentCredit: () => null,
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { BadExampleProbe } from "../probe/BadExampleProbe";
import { MASTERWORK_RUN_WIRE } from "../durable-run/useMasterworkRun";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const RULEBOOK_ID = "7c2b19de-4a30-4f65-91cd-0b7ae2d4c118";

/** The receipt a reload finds: an UNSETTLED run, still working. */
function plantTheReceipt(): void {
  const key = `probe:${RULEBOOK_ID}`;
  window.localStorage.setItem(
    `${MASTERWORK_RUN_WIRE.pointerPrefix}${key}`,
    JSON.stringify({
      runId: "6f0a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b",
      startedAt: Date.now() - 20_000,
      settled: false,
      memo: { case_brief: "A new hire intake checklist draft" },
    }),
  );
}

async function mountProbe(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <TooltipProvider>
        <BadExampleProbe
          rulebook={
            {
              id: RULEBOOK_ID,
              name: "E-waste routing",
              rules: [],
              sections: { G: { label: "General" } },
              version: 1,
            } as unknown as Parameters<typeof BadExampleProbe>[0]["rulebook"]
          }
          canEdit
        />
      </TooltipProvider>,
    );
  });
  return { container, root };
}

describe("a restoring probe never offers to start", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // The rejoin that never answers — the nine-second window, held open.
    mockDispatch.mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not paint the setup screen while a round is being picked back up", async () => {
    plantTheReceipt();
    const { container, root } = await mountProbe();
    const text = container.textContent ?? "";
    expect(text).not.toContain("Write the first one");
    expect(text).not.toContain("Up to 5 rounds");
    await act(async () => root.unmount());
  });

  /**
   * 🚨 THE PATH THE FIRST GUARD MISSED (cold walk 6, finding 3, 2026-09-17).
   *
   * The test above holds the rejoin open FOR EVER, which is the one shape of
   * that nine-second window where nothing else can go wrong. The real window
   * is the opposite: the rejoin RETURNS, almost at once, without handing the
   * screen anything to render. Both of its real-world endings do that —
   *
   *   * the rejoin is routed to any worker but the one executing the run (the
   *     live replay channel is process-local, the API runs many workers), and
   *     answers with the durable ROW, which mid-run says `processing`; or
   *   * the rejoin request simply does not land.
   *
   * — and the run still has a minute of work left either way. `restoring` was
   * cleared in the rejoin's `.finally`, so it went false while the surface held
   * no content and `running` was still true: the setup screen came straight
   * back over a live round, which is the defect the first guard was written to
   * make impossible.
   *
   * RED against the pre-fix hook, both cases:
   *   ● does not paint the setup screen while the run is still working
   *     on the server › expect(text).not.toContain("Write the first one")
   *     Expected substring: not "Write the first one"
   *     Received string:    "…Write the first one Up to 5 rounds…"
   */
  it("does not paint the setup screen while the run is still working on the server", async () => {
    plantTheReceipt();
    // The rejoin answers at once with the durable row: still processing, and
    // nothing to render.
    mockDispatch.mockImplementation((request: Record<string, unknown>) => {
      const onStreamEvent = request.onStreamEvent as
        | ((event: unknown) => void)
        | undefined;
      onStreamEvent?.({
        event: "data",
        data: {
          type: "masterwork_run_snapshot",
          status: "processing",
          run_id: "6f0a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b",
        },
      });
      return Promise.resolve({});
    });
    const { container, root } = await mountProbe();
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? "";
    expect(text).not.toContain("Write the first one");
    expect(text).not.toContain("Up to 5 rounds");
    await act(async () => root.unmount());
  });

  it("does not paint the setup screen when the rejoin cannot be reached", async () => {
    plantTheReceipt();
    mockDispatch.mockImplementation(() =>
      Promise.resolve({ error: { message: "Failed to fetch" } }),
    );
    const { container, root } = await mountProbe();
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? "";
    expect(text).not.toContain("Write the first one");
    expect(text).not.toContain("Up to 5 rounds");
    await act(async () => root.unmount());
  });

  /**
   * AND THE SESSION COMES BACK WITH IT. Round 1's example and the Expert's own
   * words about it live in mount-local state that a reload throws away, so the
   * restored screen used to be empty even once it stopped contradicting
   * itself — "round 1's finished content gone from view", which is most of
   * what made the walker call the screen garbled. They ride on the run's own
   * receipt now, beside the case brief.
   */
  it("brings back the round already answered while the next one is written", async () => {
    const key = `probe:${RULEBOOK_ID}`;
    window.localStorage.setItem(
      `${MASTERWORK_RUN_WIRE.pointerPrefix}${key}`,
      JSON.stringify({
        runId: "6f0a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b",
        startedAt: Date.now() - 20_000,
        settled: false,
        memo: {
          case_brief: "A new hire intake checklist draft",
          prior_rounds: JSON.stringify([
            {
              example_title: "A new hire intake checklist that looks right",
              example_body: "Day one: hand over the laptop, then the badge.",
              probe_label: "sequencing",
              critique: "The badge has to come before the laptop, always.",
            },
          ]),
        },
      }),
    );
    mockDispatch.mockImplementation(() => new Promise(() => undefined));
    const { container, root } = await mountProbe();
    const text = container.textContent ?? "";
    // The example's own heading — the body renders through `RichDocument`,
    // which is not what this is about.
    expect(text).toContain("A new hire intake checklist that looks right");
    expect(container.querySelector<HTMLTextAreaElement>("#probe-critique")?.value).toBe(
      "The badge has to come before the laptop, always.",
    );
    await act(async () => root.unmount());
  });

  it("still offers to start when there is no round to pick up", async () => {
    const { container, root } = await mountProbe();
    expect(container.textContent).toContain("Write the first one");
    await act(async () => root.unmount());
  });
});
