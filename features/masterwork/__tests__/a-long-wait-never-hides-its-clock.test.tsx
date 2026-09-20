/**
 * N8 — A LONG WAIT NEVER HIDES ITS CLOCK. A forcing function.
 *
 * ## What it exists to stop happening again
 *
 * Cold walk 13, 2026-09-20 (`common-docs/projects/masterwork-methods-census/
 * jobs-bar-2026-09-16/cold-walk-13/README.md`, N8 + Friction). Three waits on
 * the product's MAIN path were completely silent about duration:
 *
 *   1. "Start" on New Masterwork step 2 sat on the word **"Starting…"** for at
 *      least 45 seconds (resolved between 45s and 51s);
 *   2. "Start the interview" showed a bare `ChatRoomSkeleton` for **60s**;
 *   3. "Continue this one" after a reload showed the same one for **53s**.
 *
 * The walker's verdict on the product was "no", and this was on the list. The
 * product's own distillation and Shadow panels already do it right — *"25s so
 * far — this usually takes about 2 minutes."* — through the platform's one
 * waiting line, `lib/progress/WorkingNotice.tsx`. These three never reached
 * it.
 *
 * ## The two things a waiting person is owed, and why a skeleton is not them
 *
 * A skeleton is a LAYOUT promise and it is the right thing to draw. What it
 * cannot do is answer the only two questions someone staring at it has: how
 * long has this been, and is it broken. So the bar is: every waiting gate on
 * the opening path renders a CLOCK THAT MOVES and a PROMISE THAT CORRECTS
 * ITSELF once it has been overtaken.
 *
 * ## Four legs, each proven RED before the fix
 *
 *   1. minting a fresh interview says how long it has been;
 *   2. resuming a prior interview says how long it has been;
 *   3. the panel's own boot (Mandate + document + history — what a deep-linked
 *      `?interview=1` arrival lands on) says how long it has been;
 *   4. "Start" on New Masterwork renders the SAME platform primitive rather
 *      than a lone adjective, wired to the same wait it disables the button
 *      on.
 *
 * Legs 1-3 drive the REAL `ScoutInterviewContent` through its real gates —
 * nothing here mocks the thing under test. Leg 4 is a source census because
 * that surface's wait is one `useState` on a 1000-line wizard and a rendered
 * reproduction of it would be a test of the harness, not of the screen; it
 * reads the real file and fails if the wait stops reaching the primitive.
 *
 * A fifth leg holds the primitive itself honest about sub-minute work, because
 * all four openings ARE sub-minute work (see `record/openingRates.ts`) and an
 * estimate rounded up to "about a minute" is the same class of untrue sentence
 * pointing the other way.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";

import { describeDuration } from "@/lib/progress/estimateSentence";
import {
  INTERVIEW_HISTORY_MS,
  INTERVIEW_OPENING_MS,
  INTERVIEW_RESUME_MS,
  NEW_RULEBOOK_OPENING_MS,
} from "../record/openingRates";

type MandateState = {
  mandate: { agentId: string; contract: unknown } | null;
  loading: boolean;
  error: string | null;
};
type DocState = {
  document: string | null;
  organizationId: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

let mandateState: MandateState;
let docState: DocState;
let interviewRows: unknown[] | "never-resolves";
/** What `useAgentLauncher` has minted — null is the wait under test. */
let launchedConversationId: string | null;
/** Whether `useConversationResume` is still rehydrating. */
let stillResuming: boolean;

jest.mock("@/features/mandates/useMandate", () => ({
  useMandate: () => mandateState,
}));
jest.mock("@/features/masterwork/agent-context/useRulebookDocument", () => ({
  useRulebookDocument: () => docState,
}));
jest.mock("@/features/masterwork/record/service", () => ({
  listRulebookInterviews: () =>
    interviewRows === "never-resolves"
      ? new Promise(() => {})
      : Promise.resolve(interviewRows),
  listRulebookInterviewsWithAccess: () =>
    Promise.resolve({ interviews: [], hiddenCount: 0 }),
  associateInterviewWhenPersisted: () => {},
}));
jest.mock("@/features/agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ conversationId: launchedConversationId }),
}));
jest.mock("@/features/agents/hooks/useConversationResume", () => ({
  useConversationResume: () => ({ isResuming: stillResuming, error: null }),
}));
// The conversation column itself is a whole chat surface and is not what this
// suite is about — it only has to be distinguishable from the wait.
jest.mock("@/features/agents/components/shared/AgentConversationColumn", () => ({
  AgentConversationColumn: () => <div data-testid="column">column</div>,
}));
// The start screen's own content is `interview-door-never-silent`'s subject.
// What this suite needs from it is the REAL handoff: pressing its primary
// control is what moves the real component into minting a conversation, which
// is the 60-second wait under test.
jest.mock("@/features/masterwork/record/InterviewStartScreen", () => ({
  InterviewStartScreen: ({
    onStart,
  }: {
    onStart: (picked: {
      mode: string;
      probes: string[];
      closingSurprises: boolean;
      voiceOn: boolean;
    }) => void;
  }) => (
    <button
      data-testid="start-screen"
      onClick={() =>
        onStart({
          mode: "primed",
          probes: [],
          closingSurprises: false,
          voiceOn: false,
        })
      }
    >
      Start the interview
    </button>
  ),
}));
jest.mock("@/features/masterwork/record/InterviewChooser", () => ({
  InterviewChooser: () => <div data-testid="chooser">chooser</div>,
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
      }),
    }),
  },
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    canLoad: true,
    organizationRequired: false,
    resolving: false,
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => {},
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      userProfile: { userMetadata: { fullName: "Dana" } },
      // The real shape `selectPrimaryRequest` reads. An empty store means
      // "no turn has started", which is true of every wait in this suite.
      activeRequests: { byConversationId: {}, byRequestId: {} },
    }),
}));

import { ScoutInterviewContent } from "../components/detail/ScoutInterviewPanel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function open(props: {
  startNew?: boolean;
  initialConversationId?: string;
}) {
  await act(async () => {
    root.render(
      <ScoutInterviewContent
        rulebookId="rb1"
        rulebookName="Commercial irrigation quoting"
        startNew={props.startNew}
        initialConversationId={props.initialConversationId}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function text(): string {
  return container.textContent ?? "";
}

beforeEach(() => {
  mandateState = {
    // The real contract shape — `missingRequiredVariables` reads both keys,
    // and a launch that cannot satisfy them renders the refusal screen
    // instead of the wait, which would hide the gate under test.
    mandate: {
      agentId: "agent-1",
      contract: { requiredVariables: [], spillVariables: [] },
    },
    loading: false,
    error: null,
  };
  docState = {
    document: "# Commercial irrigation quoting",
    organizationId: null,
    loading: false,
    error: null,
    reload: () => {},
  };
  interviewRows = [];
  launchedConversationId = null;
  stillResuming = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * The bar, in one place: a clock that has counted, and a sentence about how
 * long this kind of work takes. Both come from the real primitive
 * (`elapsedDetail`), so a surface cannot satisfy this by printing its own.
 */
function expectAHonestWait(): void {
  expect(text()).toMatch(/\d+m?s so far/);
  expect(text()).toContain("usually takes");
}

describe("leg 1 — minting a fresh interview never waits in silence", () => {
  /**
   * The real "Start the interview" beat: the start screen hands its choices
   * back, the real component moves to `new`, and `useAgentLauncher` has not
   * minted a conversation yet. Walk 13 timed 60 seconds of bare skeleton here.
   */
  async function pressStartTheInterview(): Promise<void> {
    await open({ startNew: true });
    const button = container.querySelector(
      "[data-testid=start-screen]",
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("says how long it has been while the conversation is being minted", async () => {
    launchedConversationId = null;
    await pressStartTheInterview();
    // We really are past the start screen and inside the launch.
    expect(container.querySelector("[data-testid=start-screen]")).toBeNull();
    expectAHonestWait();
  });

  it("and stops saying it the moment the first question can be asked", async () => {
    launchedConversationId = "conv-new";
    await pressStartTheInterview();
    expect(container.querySelector("[data-testid=column]")).not.toBeNull();
    expect(text()).not.toContain("so far");
  });
});

describe("leg 2 — resuming a prior interview never waits in silence", () => {
  it("says how long it has been while the transcript comes back", async () => {
    stillResuming = true;
    await open({ initialConversationId: "conv-1" });
    expectAHonestWait();
  });

  it("and stops saying it the moment the conversation is on screen", async () => {
    stillResuming = false;
    await open({ initialConversationId: "conv-1" });
    expect(container.querySelector("[data-testid=column]")).not.toBeNull();
    expect(text()).not.toContain("so far");
  });
});

describe("leg 3 — the panel's own boot never waits in silence", () => {
  /**
   * This is the gate a deep-linked `?interview=1` arrival lands on. Walk 13
   * described exactly this beat as "left me on the Rulebook home with no panel
   * for 25 seconds" — the panel WAS open, and what was inside it said nothing.
   */
  it("says how long it has been while the interview history is read", async () => {
    interviewRows = "never-resolves";
    await open({ startNew: false });
    expectAHonestWait();
  });

  it("says how long it has been while the interviewer is resolved", async () => {
    mandateState = { mandate: null, loading: true, error: null };
    await open({ startNew: false });
    expectAHonestWait();
  });

  it("says how long it has been while the Rulebook document loads", async () => {
    docState = { ...docState, document: null, loading: true };
    await open({ startNew: false });
    expectAHonestWait();
  });
});

describe("leg 4 — Start on New Masterwork reaches the same primitive", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "features/masterwork/intake/NewRulebookFlow.tsx"),
    "utf8",
  );

  it("renders the platform's waiting line, not a lone adjective", () => {
    expect(source).toContain("WorkingNotice");
    expect(source).toContain("NEW_RULEBOOK_OPENING_MS");
  });

  it("wires the notice to the SAME wait the button is disabled on", () => {
    // One source of truth for "we are starting": if the notice read a second
    // flag it could be shown while the button was live, or the other way
    // round — which is how the walk met a spinning button over nothing.
    expect(source).toContain("const saving = startedAt !== null;");
    expect(source).toContain("startedAt={startedAt}");
  });

  it("does not still hold a bare boolean the notice cannot time", () => {
    expect(source).not.toContain("setSaving(");
  });
});

describe("leg 5 — a sub-minute promise is allowed to be sub-minute", () => {
  /**
   * Every opening this file guards is seconds of database round-trips with no
   * model call at all (measured 2026-09-20; see `record/openingRates.ts`).
   * `describeDuration` used to round everything under 90 seconds UP to "about
   * a minute", so none of them could state a true promise — and a promise
   * inflated to a minute never corrects itself either, because the overdue
   * band is computed from it.
   */
  it("does not call a few seconds a minute", () => {
    expect(describeDuration(3_000)).toBe("a few seconds");
    expect(describeDuration(6_000)).toBe("a few seconds");
    expect(describeDuration(20_000)).toBe("about 20 seconds");
  });

  it("still speaks in minutes once the work really is minutes", () => {
    expect(describeDuration(60_000)).toBe("about a minute");
    expect(describeDuration(180_000)).toBe("about 3 minutes");
  });

  it("gives every Masterwork opening a promise it can keep", () => {
    for (const ms of [
      NEW_RULEBOOK_OPENING_MS,
      INTERVIEW_OPENING_MS,
      INTERVIEW_RESUME_MS,
      INTERVIEW_HISTORY_MS,
    ]) {
      expect(ms).toBeGreaterThan(0);
      expect(describeDuration(ms)).not.toBe("about a minute");
    }
  });
});
