/**
 * A TEACH-BACK REMEMBERS WHAT THE EXPERT CORRECTED — ACROSS THE PAGE.
 *
 * Cold walk 6, reproduced live 2026-09-17 on a brand-new Rulebook: the Expert
 * corrected round 1, the room visibly acted on it (draft rules landed on the
 * Rulebook), she came back to the page, pressed "Yes, that's it" — and the
 * sign-off screen said "You corrected 0 rounds".
 *
 * The session's rounds lived ONLY in mount-time React state. Every round is one
 * HTTP call carrying the rounds so far, so after a rejoin the request went out
 * rebuilt from the durable run's LAST round alone: no correction in it at all.
 * The server counted the corrections in the request, so it counted zero — and
 * the explainer had lost her corrections with them.
 *
 * SUT: the real `TeachBack`, over the real wizard-draft persistence (the store,
 * `wizardDraftSlice`, the exact bytes its sync policy writes, and the real
 * `sync/rehydrate` action). Stubbed: the durable-run transport, the feedback
 * RPC, the knob reads, the shared textarea, the audio system.
 *
 * The rejoin is performed the way it actually happens: the session is
 * persisted, the tree is thrown away, a NEW store rehydrates from those bytes,
 * and the screen is mounted again on the round the durable run hands back.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  wizardDraftPolicy,
  type WizardDraftState,
} from "@/lib/redux/slices/wizardDraftSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";
import { TeachBack } from "../TeachBack";
import { parseTeachBackRound, type TeachBackRound } from "../service";
import type { Rulebook } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RUN_ID = "9c1f0a61-1f1e-4a51-8c2f-0f4b2c0d4e77";
const CORRECTION =
  "No — we never reject a load for moisture alone. Only when it is above fifteen percent AND the load is mixed metal.";

const launches: Record<string, unknown>[] = [];
const runResult: { current: unknown } = { current: null };

jest.mock("@/lib/output-feedback/service", () => ({
  saveOutputFeedback: () => Promise.resolve({ id: "row" }),
}));

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: (_feature: string, key: string) =>
    Promise.resolve(key === "rounds" ? 6 : 60),
  knobBool: () => Promise.resolve(true),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => {
    const { enableTextStats: _s, enableVoice: _v, autoGrow: _g, ...rest } = props;
    return <textarea {...(rest as object)} />;
  },
}));

jest.mock("@/features/audio/unlock", () => ({ primeAudioOutput: () => {} }));
jest.mock("@/features/audio/service/useSpeech", () => ({
  useSpeech: () => ({
    speak: () => "id",
    status: null,
    pause: () => {},
    resume: () => {},
  }),
}));

jest.mock("../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: () => ({
    result: runResult.current,
    running: false,
    launch: (body: Record<string, unknown>) => {
      launches.push(body);
      return Promise.resolve();
    },
    reset: () => {},
    fail: () => {},
    cancel: null,
    restoring: false,
    cancelling: false,
    retry: null,
    error: null,
    stage: null,
    waitMessage: null,
    stoppedMessage: null,
    status: "idle",
    elapsedMs: 0,
    overdue: false,
  }),
}));

const RULEBOOK = {
  id: "e3b21d77-ddab-484f-b877-6b3ddffd5ddd",
  name: "Scrap Gate Checks",
  description: "Which incoming loads we reject at the gate.",
  rules: [],
} as unknown as Rulebook;

function roundPayload(over: Record<string, unknown> = {}) {
  return {
    rulebook_id: RULEBOOK.id,
    run_id: RUN_ID,
    round_index: 1,
    round_count: 6,
    done: false,
    subject: "how you check a load at the gate",
    explanation: "Here is how I understand you decide. You look at moisture.",
    basis: "rulebook",
    rule_ids_cited: ["check-the-moisture"],
    uncertain_part: "I'm least sure about mixed loads.",
    distilled_round: 0,
    rules_added: 0,
    rule_ids: [],
    answered_rounds: 0,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

function makeStore(): Store {
  return configureStore({ reducer: createSlimRootReducer() });
}

async function mount(store: Store, payload: Record<string, unknown> | null) {
  runResult.current = payload ? parseTeachBackRound(payload) : null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <TeachBack rulebook={RULEBOOK} canEdit />
      </Provider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function unmount() {
  act(() => root.unmount());
  container.remove();
}

function buttonWith(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );
  if (!found) throw new Error(`no button matching ${text}`);
  return found;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function typeCorrection(value: string) {
  const box = container.querySelector("textarea");
  if (!box) throw new Error("no correction box on screen");
  act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The bytes the sync engine would have written for this store's drafts. */
function persist(store: Store): unknown {
  const state = store.getState() as { wizardDraft: WizardDraftState };
  return wizardDraftPolicy.config.serialize!(state.wizardDraft);
}

/** A brand-new store that rehydrates from those bytes — i.e. coming back. */
function storeAfterRejoin(persisted: unknown): Store {
  const store = makeStore();
  const body = wizardDraftPolicy.config.deserialize!(persisted);
  act(() => {
    store.dispatch(
      buildRehydrateAction("wizardDraft", body, { fromRehydrate: true }),
    );
  });
  return store;
}

function lastLaunchRounds(): TeachBackRound[] {
  const body = launches[launches.length - 1];
  return (body?.rounds ?? []) as TeachBackRound[];
}

beforeEach(() => {
  launches.length = 0;
  runResult.current = null;
});

it("sends the correction it collected before the page went away", async () => {
  // Round 1 is on screen; she corrects it.
  const store = makeStore();
  await mount(store, roundPayload());
  typeCorrection(CORRECTION);
  await click(buttonWith("Send this and try again"));
  expect(lastLaunchRounds()[0].correction).toContain("mixed metal");
  const saved = persist(store);
  unmount();

  // --- she comes back; the durable run hands her round 2 ---
  const rejoined = storeAfterRejoin(saved);
  await mount(
    rejoined,
    roundPayload({
      round_index: 2,
      explanation: "Here it is again, with what you told me in it.",
      distilled_round: 1,
      rules_added: 2,
      answered_rounds: 1,
    }),
  );

  // --- and signs off ---
  await click(buttonWith("Yes, that's it"));
  const sent = lastLaunchRounds();
  // THE WHOLE SESSION WENT OUT, correction and all. Before this fix the
  // rejoined screen sent ONE round with an empty correction, which is why the
  // server — which counts the corrections in the request — answered zero.
  expect(sent).toHaveLength(2);
  expect(sent[0].correction).toContain("mixed metal");
  unmount();
});

it("counts the rounds actually corrected, not what the payload claims", async () => {
  // A session with one corrected round, persisted, then rejoined straight onto
  // the end of the teach-back. The done payload still says `answered_rounds: 0`
  // — the exact number the walk was shown — and the screen must not repeat it.
  const store = makeStore();
  await mount(store, roundPayload());
  typeCorrection(CORRECTION);
  await click(buttonWith("Send this and try again"));
  const saved = persist(store);
  unmount();

  await mount(
    storeAfterRejoin(saved),
    roundPayload({
      round_index: 1,
      done: true,
      done_reason: "you said that's it",
      distilled_round: 1,
      rules_added: 2,
      answered_rounds: 0,
    }),
  );
  const text = container.textContent ?? "";
  expect(text).toContain("That's the teach-back done");
  expect(text).toContain("You corrected 1 round");
  expect(text).not.toContain("You corrected 0 rounds");
  unmount();
});

it("says it cannot count when this device does not hold the whole session", async () => {
  // Nothing persisted here — another device, or cleared history — but the run
  // says the session had reached round 3. A number would be a guess, so the
  // screen says what it knows instead of counting to zero.
  await mount(
    makeStore(),
    roundPayload({
      round_index: 3,
      done: true,
      done_reason: "you said that's it",
      answered_rounds: 0,
    }),
  );
  const text = container.textContent ?? "";
  expect(text).toContain("we can't say here how many rounds you corrected");
  expect(text).not.toContain("You corrected 0 rounds");
  unmount();
});
