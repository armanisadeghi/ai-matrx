/**
 * AN ANSWERED TRIAD CARD SURVIVES A RELOAD.
 *
 * 🚨 THE DEFECT (cold walk 4, finding 2, 2026-09-16), reproduced live here on
 * the same day against `origin/main`:
 *
 *   On a brand-new Rulebook, dealt the cards, answered card 1 and pressed
 *   "Save and next", answered card 2 and pressed it again — both succeeded on
 *   screen — then reloaded the page. The board came back as
 *   "Three at a time / Deal me in": no "Card 3 of 10", no banner, no line
 *   saying two answers were still being turned into rules. The Rulebook's rule
 *   list, read immediately, still held only the three interview rules.
 *
 *   The answers were NOT lost — the server detaches the work on disconnect and
 *   both rules landed about a minute later — which is worse than a visible
 *   failure, because the only conclusion the screen supported was "nothing
 *   saved", and the natural next move is to play the same cards again.
 *
 * Every piece of the sitting lived in React state and nowhere else: the deck,
 * the index, which cards had been answered, and what each answer returned. The
 * fix has two halves, and this guards the client one:
 *
 *   * client: the sitting is written to this browser as it is played and
 *     picked up on the next load, saying so in words — including that an
 *     answer still in flight when you left carried on without you;
 *   * server: `/masterworks/ingest-triad` runs under the Masterwork run
 *     ledger, so each answer has a durable run row before the paid call and
 *     `source_identity.claim_source` gets a real run id again (guarded by
 *     aidream `test_every_rule_writing_lane_is_durable.py`).
 *
 * THE FORCING FUNCTION: the REAL component, a real answer, and a SECOND mount
 * that knows nothing except what the first one actually wrote to storage —
 * exactly as a refresh knows nothing. Only the transport is faked.
 *
 * RED against the pre-fix component: the second mount renders "Deal me in".
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

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/features/masterwork/components/AgentCredit", () => ({
  AgentCredit: () => null,
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { TriadGamePage } from "../triad/TriadGamePage";
import { TRIAD_DEAL_PATH, TRIAD_INGEST_PATH } from "../triad/service";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no matchMedia; the lane's context menu asks for it on mount.
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

const RULEBOOK_ID = "4d1c8a92-77b6-4c31-9f0e-2a5b6c7d8e90";

const DECK = {
  type: "masterwork_triads_ready",
  rulebook_id: RULEBOOK_ID,
  mode: "best_one",
  triads: [
    {
      id: "triad-one",
      prompt: "You have three pallets from a corporate office upgrade. Which one gets flagged for manual sort?",
      mode: "best_one",
      items: [
        { key: "a", text: "A gaylord of mixed USB keyboards and wired mice.", note: "Keyboards and mice" },
        { key: "b", text: "A pallet of desk phones and conferencing speaker units.", note: "Desk phones" },
        { key: "c", text: "12x uninterruptible power supply units, unknown battery status.", note: "UPS units" },
      ],
    },
    {
      id: "triad-two",
      prompt: "Three loads arrive the same morning. Which one is the odd one out?",
      mode: "best_one",
      items: [
        { key: "a", text: "A pallet of bare hard disk drives pulled from servers.", note: "Hard drives" },
        { key: "b", text: "A pallet of CRT monitors from a school clear-out.", note: "CRT monitors" },
        { key: "c", text: "A pallet of desktop power supplies with severed cords.", note: "Power supplies" },
      ],
    },
  ],
  dropped_repeats: 0,
};

/** The Expert's own line — the rule candidate. */
const REASON =
  "Anything with a sealed pouch cell I cannot pop out in thirty seconds is a manual sort, because that is what starts fires in the shredder.";

let ingested: Record<string, unknown>[] = [];
/** When true, an answer is accepted but never answered — the in-flight case. */
let holdTheIngest = false;

type StreamRequest = {
  path: string;
  body?: Record<string, unknown>;
  onStreamEvent?: (event: { event: "data"; data: Record<string, unknown> }) => void;
};

function serveTheTriad(): void {
  mockDispatch.mockImplementation(async (request: StreamRequest) => {
    if (request.path === TRIAD_DEAL_PATH) {
      request.onStreamEvent?.({ event: "data", data: DECK });
      return { data: null, error: null };
    }
    if (request.path === TRIAD_INGEST_PATH) {
      ingested.push(request.body ?? {});
      if (holdTheIngest) return new Promise(() => undefined);
      request.onStreamEvent?.({
        event: "data",
        data: {
          type: "masterwork_ingest_complete",
          rulebook_id: RULEBOOK_ID,
          rulebook_version: 2,
          added: 1,
          quotes_unverified: 0,
          already_distilled: [],
        },
      });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
}

async function mountGame(): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <TooltipProvider>
        <TriadGamePage rulebookId={RULEBOOK_ID} rulebookName="E-waste routing" />
      </TooltipProvider>,
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function buttonSaying(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => (button.textContent ?? "").includes(text));
  if (!match) throw new Error(`no button saying "${text}" on screen`);
  return match;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function type(container: HTMLElement, value: string): Promise<void> {
  const box = container.querySelector<HTMLTextAreaElement>("textarea");
  if (!box) throw new Error("no answer box on screen");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Deal, pick the third item, say why, and press Save and next — for real. */
async function playOneCard(mounted: Mounted): Promise<void> {
  await click(buttonSaying(mounted.container, "Deal me in"));
  expect(mounted.container.textContent).toContain("Card 1 of 2");
  await click(buttonSaying(mounted.container, "uninterruptible power supply"));
  await type(mounted.container, REASON);
  await click(buttonSaying(mounted.container, "Save and next"));
}

describe("an answered triad card survives a reload", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    ingested = [];
    holdTheIngest = false;
    serveTheTriad();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("comes back on the card you were on, and says so", async () => {
    const first = await mountGame();
    await playOneCard(first);
    expect(ingested).toHaveLength(1);
    expect((ingested[0] as { reason: string }).reason).toBe(REASON);
    expect(first.container.textContent).toContain("Card 2 of 2");
    await first.unmount();

    // THE RELOAD: a brand new mount that knows only what the first one wrote.
    const back = await mountGame();
    expect(back.container.textContent).not.toContain("Deal me in");
    expect(back.container.textContent).toContain("Card 2 of 2");
    expect(back.container.textContent).toContain("Picked up where you left off");
    expect(back.container.textContent).toContain("after answering 1");
    await back.unmount();
  });

  it("an answer still in flight when you left is named, not reported as saved", async () => {
    holdTheIngest = true;
    const first = await mountGame();
    await playOneCard(first);
    expect(ingested).toHaveLength(1);
    await first.unmount();

    const back = await mountGame();
    expect(back.container.textContent).toContain("Card 2 of 2");
    expect(back.container.textContent).toContain(
      "still being turned into rules when you left",
    );
    // The remedy is the true one: the work carried on server-side.
    expect(back.container.textContent).toContain("check your Rulebook");
    await back.unmount();
  });

  it("a fresh Rulebook still starts at the beginning", async () => {
    const first = await mountGame();
    await playOneCard(first);
    await first.unmount();

    // A different Rulebook must never inherit this one's board.
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    await act(async () => {
      root = createRoot(container);
      root.render(
        <TooltipProvider>
          <TriadGamePage
            rulebookId="0c9d8e7f-6a5b-4c3d-2e1f-0a9b8c7d6e5f"
            rulebookName="Something else"
          />
        </TooltipProvider>,
      );
    });
    expect(container.textContent).toContain("Deal me in");
    expect(container.textContent).not.toContain("Picked up where you left off");
    await act(async () => root.unmount());
    container.remove();
  });
});
