/**
 * COLD WALK 12, D9 — THE RELOAD THAT THREW AWAY A LIVE INTERVIEW.
 *
 * An Expert four turns into the Scout interview reloaded
 * `/masterwork/<id>?interview=1` and landed back on "Before we start", with no
 * offer to carry on — while all sixteen of her messages, and the kept source
 * row built from them, sat safely in the database.
 *
 * The "Pick up where you left off" chooser was already written. It never
 * rendered, because the history read answered `[]`:
 *
 *   - the read is organization-required and this panel opens on deep-link
 *     ARRIVAL, so a reload raced the boot that selects the organization and
 *     the transport refused before it ever reached the network; and
 *   - `interviewConversationIds` logged that refusal and returned `[]`, which
 *     is the honest value for "this Rulebook has never been talked about".
 *
 * THE CLASS, not the instance: a failed read that wears the face of a
 * confident empty answer. The same shape as D1 (a Start that silently did
 * nothing) and D5 (a Library that said it had never been synced) on this same
 * walk. So the cases below fix the two halves separately — nothing may start
 * over while the organization is still settling, and a read that FAILED must
 * never reach the branch that decides there is no history.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InterviewHistoryUnavailable } from "@/features/masterwork/record/service";

type MandateState = {
  mandate: { agentId: string; contract: unknown } | null;
  loading: boolean;
  error: string | null;
};

let mandateState: MandateState;
let historyAnswer: () => Promise<unknown[]>;
// The hook's real contract: the legacy boolean pair AND `organizationState`,
// the one reading the panel now switches on (R37, the fourth state).
let orgState: {
  canLoad: boolean;
  organizationRequired: boolean;
  resolving: boolean;
  organizationState: "ready" | "resolving" | "required" | "unavailable";
  unavailableReason: string | null;
  retry: () => void;
};
/** Every call the panel made for the history, so a retry is provable. */
let historyCalls: number;

jest.mock("@/features/mandates/useMandate", () => ({
  useMandate: () => mandateState,
}));

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => orgState,
}));

jest.mock("@/features/masterwork/agent-context/useRulebookDocument", () => ({
  useRulebookDocument: () => ({
    document: "# Pressure-drop diagnosis",
    organizationId: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

jest.mock("@/features/masterwork/record/service", () => ({
  // The real error class, so the panel's `instanceof`/message handling is the
  // production one and not a test-shaped stand-in.
  InterviewHistoryUnavailable: jest.requireActual(
    "@/features/masterwork/record/service",
  ).InterviewHistoryUnavailable,
  listRulebookInterviews: () => {
    historyCalls += 1;
    return historyAnswer();
  },
  listRulebookInterviewsWithAccess: () =>
    Promise.resolve({ interviews: [], hiddenCount: 0 }),
  associateInterviewWhenPersisted: () => {},
}));

jest.mock("@/features/masterwork/record/InterviewStartScreen", () => ({
  InterviewStartScreen: () => (
    <div data-testid="start-screen">Before we start</div>
  ),
}));
jest.mock("@/features/masterwork/record/InterviewChooser", () => ({
  InterviewChooser: () => (
    <div data-testid="chooser">Pick up where you left off</div>
  ),
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

// The picker inside the shared refusal is a surface with its own suites and a
// whole store's worth of reads; this file proves the PANEL's posture, so the
// picker is stood in.
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));

jest.mock("@/lib/redux/hooks", () => {
  // THE FIXTURE LAW: the refusal the panel now renders is the shared
  // `OrganizationContextNotice`, whose picker reads REAL app-context state, so
  // the state here is built by the slice's own constructor — never a hand-shape.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeAppContextState } = jest.requireActual(
    "@/lib/redux/slices/appContextSlice",
  ) as typeof import("@/lib/redux/slices/appContextSlice");
  const state = {
    userProfile: { userMetadata: { fullName: "Dana" } },
    appContext: makeAppContextState({ organization_id: null, orgBootstrapResolved: true }),
  };
  return {
    useAppDispatch: () => () => {},
    useAppStore: () => ({ getState: () => state }),
    useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
  };
});

import { ScoutInterviewContent } from "../ScoutInterviewPanel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** A reload arrives with NO conversation id and NO "start new" intent. */
async function reloadOntoTheInterview() {
  await act(async () => {
    root.render(
      <ScoutInterviewContent
        rulebookId="a18eb3de-ebb7-4e02-895e-c4ab534aa24f"
        rulebookName="Pressure-Drop Diagnosis for Autumn Browning"
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  historyCalls = 0;
  mandateState = {
    mandate: { agentId: "agent-1", contract: {} },
    loading: false,
    error: null,
  };
  orgState = {
    canLoad: true,
    organizationRequired: false,
    resolving: false,
    organizationState: "ready",
    unavailableReason: null,
    retry: () => undefined,
  };
  historyAnswer = async () => [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("D9 — a reload never restarts an interview that is already going", () => {
  it("offers to carry on when the history read succeeds and finds one", async () => {
    historyAnswer = async () => [
      {
        conversationId: "36142a62-8f35-4340-b22b-e7cf4330d792",
        title: "Pressure-Drop Diagnosis for Autumn Browning",
        createdAt: "2026-09-20T03:51:50Z",
      },
    ];
    await reloadOntoTheInterview();
    expect(container.querySelector("[data-testid=chooser]")).not.toBeNull();
    expect(container.querySelector("[data-testid=start-screen]")).toBeNull();
  });

  it("does NOT drop onto 'Before we start' when the history read FAILED", async () => {
    historyAnswer = async () => {
      throw new InterviewHistoryUnavailable("rb1", new Error("organization_required"));
    };
    await reloadOntoTheInterview();

    expect(container.querySelector("[data-testid=start-screen]")).toBeNull();
    // Honest, and it says why starting fresh would be the wrong move.
    expect(container.textContent ?? "").toContain(
      "We couldn't check whether this Rulebook already has an interview going.",
    );
    expect(container.textContent ?? "").toContain("Try again");
  });

  it("asks again when the Expert presses Try again", async () => {
    historyAnswer = async () => {
      throw new InterviewHistoryUnavailable("rb1");
    };
    await reloadOntoTheInterview();
    expect(historyCalls).toBe(1);

    historyAnswer = async () => [
      { conversationId: "c1", title: "First", createdAt: "2026-09-20T03:51:50Z" },
    ];
    const retry = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Try again"),
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(historyCalls).toBe(2);
    expect(container.querySelector("[data-testid=chooser]")).not.toBeNull();
  });

  it("never asks — and never starts over — while no organization is settled", async () => {
    orgState = {
      canLoad: false,
      organizationRequired: true,
      resolving: false,
      organizationState: "required",
      unavailableReason: null,
      retry: () => undefined,
    };
    await reloadOntoTheInterview();
    expect(historyCalls).toBe(0);
    expect(container.querySelector("[data-testid=start-screen]")).toBeNull();
    expect(container.textContent ?? "").toContain("organization");
  });

  it("still goes to 'Before we start' on a CONFIRMED empty history", async () => {
    historyAnswer = async () => [];
    await reloadOntoTheInterview();
    expect(container.querySelector("[data-testid=start-screen]")).not.toBeNull();
  });
});
