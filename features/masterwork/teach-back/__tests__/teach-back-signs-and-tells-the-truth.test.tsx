/**
 * THE TEACH-BACK's two screen-side guards.
 *
 * The server half is guarded in
 * `aidream/aidream/services/distillation/tests/test_teach_back.py`. These two
 * failures can only happen on the SCREEN, and both are the product lying rather
 * than the product breaking — which is why they are worth a forcing test:
 *
 * 1. **"Yes, that's it" must actually sign, through the ONE existing path.**
 *    The release gate (CORE.md §7) is a verdict row on `platform.output_feedback`
 *    written by `saveOutputFeedback` with `surface_name =
 *    masterwork.expert_signature`, against the durable run that produced the
 *    explanation on screen — and it lands BEFORE the session is closed, so the
 *    server can stamp the same run id onto the rules. If the write fails the
 *    session must NOT finish: a screen that said "signed" over a failed write
 *    is the exact lie this lane's whole value depends on not telling.
 *
 * 2. **A generalist explanation must never be presented as the Expert's own.**
 *    On an empty Rulebook we describe what anyone competent would do. Saying
 *    "here's what we learned from you" over that would be the platform lying
 *    about the one thing it sells — one person's deviation from the consensus
 *    (CORE.md §2).
 *
 * The REAL `TeachBack` component runs; only the durable-run transport, the
 * feedback RPC, the knob reads, the shared textarea and the audio system are
 * stubbed.
 *
 * Proven red before green (2026-09-15), each independently:
 *
 * * drop the `await saveOutputFeedback(...)` call and just send `agreed` →
 *   "signs through the expert-signature path before closing the session" fails
 *   (no verdict row, the session closes anyway).
 * * let `signAndFinish` carry on after a failed write → "does not finish the
 *   session when the signature could not be written" fails.
 * * render `describeBasis(current.basis)` as a constant "Built from what you
 *   told us" → "says plainly when the explanation is a generalist's, not
 *   theirs" fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
// The session's rounds are persisted through the shared wizard-draft slice, so
// the SUT needs a real store — the same one the app boots with.
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";

import { TeachBack } from "../TeachBack";
import {
  buildTeachBackRequest,
  describeBasis,
  describeCorrection,
  parseTeachBackRound,
} from "../service";
import { EXPERT_SIGNATURE_SURFACE } from "../../review/signature";
import type { Rulebook } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RUN_ID = "9c1f0a61-1f1e-4a51-8c2f-0f4b2c0d4e77";

/** Every `saveOutputFeedback` call the screen made. */
const signatures: Record<string, unknown>[] = [];
/** Every durable-run launch the screen made. */
const launches: Record<string, unknown>[] = [];
/** What the next `saveOutputFeedback` does. */
const signatureBehaviour: { fail: string | null } = { fail: null };
/** The terminal payload the stubbed run hands back. */
const runResult: { current: unknown } = { current: null };

jest.mock("@/lib/output-feedback/service", () => ({
  saveOutputFeedback: (args: Record<string, unknown>) => {
    signatures.push(args);
    if (signatureBehaviour.fail) {
      return Promise.reject(new Error(signatureBehaviour.fail));
    }
    return Promise.resolve({ id: "row" });
  },
}));

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: (_feature: string, key: string) =>
    Promise.resolve(key === "rounds" ? 6 : 60),
  knobBool: () => Promise.resolve(true),
}));

// The shared textarea reaches for the Redux store and the transcription-cleanup
// assist, neither of which is this lane's code (the precedent every Masterwork
// door test sets). Dictation is the platform's, not this screen's.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => {
    const { enableTextStats: _s, enableVoice: _v, autoGrow: _g, ...rest } = props;
    return <textarea {...(rest as object)} />;
  },
}));

// The audio system mounts a whole lazy host; what this suite asserts is what
// the SCREEN says, never what came out of the speakers.
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
  name: "Pallet Intake Routing",
  description: "How incoming pallets get routed.",
  rules: [],
} as unknown as Rulebook;

function roundPayload(over: Record<string, unknown> = {}) {
  return {
    rulebook_id: RULEBOOK.id,
    run_id: RUN_ID,
    round_index: 1,
    round_count: 6,
    done: false,
    subject: "how you route a pallet",
    explanation: "Here's how I understand you decide. You read the manifest.",
    basis: "rulebook",
    rule_ids_cited: ["open-the-pallet-before-routing"],
    uncertain_part: "I'm least sure what happens with no manifest.",
    distilled_round: 0,
    rules_added: 0,
    rule_ids: [],
    answered_rounds: 0,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
let store: Store;

async function mount(payload: Record<string, unknown>) {
  runResult.current = parseTeachBackRound(payload);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({ reducer: createSlimRootReducer() });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <TeachBack rulebook={RULEBOOK} canEdit />
      </Provider>,
    );
  });
  // let the knob reads settle
  await act(async () => {
    await Promise.resolve();
  });
}

function clickByText(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((el) =>
    (el.textContent ?? "").includes(text),
  );
  if (!button) throw new Error(`no button matching ${text}`);
  return button;
}

beforeEach(() => {
  signatures.length = 0;
  launches.length = 0;
  signatureBehaviour.fail = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the teach-back signs through the one expert-signature path", () => {
  it("signs through the expert-signature path before closing the session", async () => {
    await mount(roundPayload());

    await act(async () => {
      clickByText("Yes, that's it").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(signatures).toHaveLength(1);
    const signature = signatures[0];
    // THE EXISTING PATH, and nothing new: the platform thumbs RPC, stamped
    // with the surface that makes it a signature.
    expect(signature.surfaceName).toBe(EXPERT_SIGNATURE_SURFACE);
    expect(signature.verdict).toBe("positive");
    // The SUBJECT is the durable run that produced this explanation — the same
    // id the server stamps onto the rules, so each can be found from the other.
    expect(signature.subjectType).toBe("masterwork_run");
    expect(signature.subjectId).toBe(RUN_ID);
    // The explanation they signed is frozen on the row.
    expect(String(signature.originalContent)).toContain(
      "Here's how I understand you decide",
    );

    // Only THEN is the session closed, carrying the same run id.
    expect(launches).toHaveLength(1);
    expect(launches[0].agreed).toBe(true);
    expect(launches[0].signature_subject_id).toBe(RUN_ID);
  });

  it("does not finish the session when the signature could not be written", async () => {
    signatureBehaviour.fail = "network down";
    await mount(roundPayload());

    await act(async () => {
      clickByText("Yes, that's it").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(signatures).toHaveLength(1);
    // NOTHING FAILS SILENTLY, and nothing lies: no agreeing request went out…
    expect(launches).toHaveLength(0);
    // …and the screen says what happened and what to do about it.
    expect(container.textContent).toContain("couldn't record your sign-off");
    expect(container.textContent).toContain("Press it again");
  });

  it("refuses to claim a signature when the round carried no durable run", async () => {
    await mount(roundPayload({ run_id: "" }));

    await act(async () => {
      clickByText("Yes, that's it").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(signatures).toHaveLength(0);
    expect(launches).toHaveLength(0);
    expect(container.textContent).toContain("won't claim it was signed");
  });
});

describe("the screen never passes a generalist explanation off as the Expert's", () => {
  it("says plainly when the explanation is a generalist's, not theirs", async () => {
    await mount(
      roundPayload({
        basis: "generalist",
        rule_ids_cited: [],
        explanation:
          "I have nothing from you yet, so here's how someone who does this job generally would decide.",
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("You haven't given us anything yet");
    expect(text).toContain("not you");
    // And it must NOT be wearing the rulebook sentence.
    expect(text).not.toContain("built from what you've already told us");
  });

  it("says the explanation is theirs only when it actually is", async () => {
    await mount(roundPayload());
    expect(container.textContent).toContain(
      "built from what you've already told us",
    );
  });

  it("never picks the flattering half when the basis is unreadable", () => {
    // A word we cannot read is not an answer, and "probably theirs" would be
    // the same lie with a shrug in front of it.
    expect(parseTeachBackRound(roundPayload({ basis: "whatever" }))?.basis).toBe(
      "",
    );
    expect(describeBasis("")).toContain("a stranger's guess");
  });
});

describe("a round nobody answered is never described as an answer", () => {
  // FOUND LIVE, 2026-09-15: the sign-off screen said "Nothing new came out of
  // that one" above "That's the teach-back done" — about a round the Expert had
  // not corrected at all, because they pressed "yes, that's it" instead. Zero
  // rules from a correction and zero rules because nobody corrected anything
  // are different facts; the screen had only the first sentence for both.
  it("says nothing about a round that carried no correction", () => {
    const result = parseTeachBackRound(
      roundPayload({ done: true, distilled_round: 0, answered_rounds: 2, rules_added: 0 }),
    )!;
    expect(result.distilledRound).toBe(0);
    expect(describeCorrection(result)).toBeNull();
  });

  it("still says so when a real correction produced nothing", () => {
    const result = parseTeachBackRound(
      roundPayload({ done: true, distilled_round: 2, answered_rounds: 2, rules_added: 0 }),
    )!;
    expect(describeCorrection(result)).toContain("Nothing new came out of that one");
  });

  it("reports what a correction was worth when it was worth something", () => {
    const result = parseTeachBackRound(
      roundPayload({ distilled_round: 1, answered_rounds: 1, rules_added: 2 }),
    )!;
    expect(describeCorrection(result)).toContain("became 2 draft rules");
  });
});

describe("the wire body", () => {
  it("carries the cited rule ids so the signature lands on what was on screen", () => {
    const body = buildTeachBackRequest({
      rulebookId: RULEBOOK.id,
      topic: "",
      rounds: [
        {
          subject: "how you route a pallet",
          explanation: "…",
          basis: "rulebook",
          rule_ids: ["open-the-pallet-before-routing"],
          correction: "",
        },
      ],
      agreed: true,
      signatureSubjectId: RUN_ID,
    });
    expect(body.rounds[0].rule_ids).toEqual(["open-the-pallet-before-routing"]);
    expect(body.signature_subject_id).toBe(RUN_ID);
    // The subject becomes the source note, so the run ledger and the rules say
    // what this teach-back was about.
    expect(body.source_note).toBe("how you route a pallet");
  });

  it("sends no signature subject on an ordinary round", () => {
    const body = buildTeachBackRequest({
      rulebookId: RULEBOOK.id,
      topic: "routing",
      rounds: [],
      agreed: false,
      signatureSubjectId: RUN_ID,
    });
    expect(body.signature_subject_id).toBeUndefined();
    expect(body.agreed).toBe(false);
    expect(body.topic).toBe("routing");
  });
});
