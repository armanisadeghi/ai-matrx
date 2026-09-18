/**
 * WALL W8 — THE PRIMARY ACTION THAT DID NOTHING.
 *
 * Masterwork methods census, 2026-09-15, `interview` Approach: on the Rulebook
 * page a non-technical Expert clicked "New interview", and then "start the
 * first one", and nothing happened at all — no surface, no spinner, no toast,
 * no console error. The only sign the click had registered was a background
 * `GET /mandates/masterwork.scout/resolution`: the interview content had
 * MOUNTED and had rendered nothing at all.
 *
 * That is the shape of the defect class, and it is the class this file guards,
 * not one reproduction of it: the door is opened by two pieces of local state
 * (`interviewOpen` + a nonce), and everything the Expert then sees is decided
 * by `ScoutInterviewContent`'s gates — the Mandate resolution, the Rulebook
 * document, the interview list. Every one of those gates has a state where it
 * is neither ready nor failed, and any gate that returns `null` in such a
 * state turns the whole door into the census's silence.
 *
 * Law 4 (nothing fails silently) says a screen is absent or honest, never
 * dead. So: whatever state those gates are in, opening the interview MUST put
 * something on the screen — a working surface, a waiting surface, or a
 * sentence. These cases drive the REAL `ScoutInterviewContent` through every
 * one of its gate states and fail if any of them renders nothing.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

// The two surfaces the door can land on are their own SUTs (each has its own
// honest states); here they only have to be DISTINGUISHABLE from nothing.
jest.mock("@/features/masterwork/record/InterviewStartScreen", () => ({
  InterviewStartScreen: () => <div data-testid="start-screen">start</div>,
}));
jest.mock("@/features/masterwork/record/InterviewChooser", () => ({
  InterviewChooser: () => <div data-testid="chooser">chooser</div>,
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
    }),
  },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => {},
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ userProfile: { userMetadata: { fullName: "Dana" } } }),
}));

import { ScoutInterviewContent } from "../ScoutInterviewPanel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function ready(): MandateState {
  return {
    mandate: { agentId: "agent-1", contract: {} },
    loading: false,
    error: null,
  };
}

async function openTheDoor(props: { startNew?: boolean } = {}) {
  await act(async () => {
    root.render(
      <ScoutInterviewContent
        rulebookId="rb1"
        rulebookName="NAID vs R2 routing"
        startNew={props.startNew ?? true}
      />,
    );
  });
  // let the interview-list effect settle
  await act(async () => {
    await Promise.resolve();
  });
}

/** What the Expert would see. Empty means the census's silence. */
function whatIsOnScreen(): string {
  return container.innerHTML.trim();
}

beforeEach(() => {
  mandateState = ready();
  docState = {
    document: "# NAID vs R2 routing",
    organizationId: null,
    loading: false,
    error: null,
    reload: () => {},
  };
  interviewRows = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Wall W8 — opening the interview always puts something on screen", () => {
  it("shows the start screen when everything is ready", async () => {
    await openTheDoor();
    expect(container.querySelector("[data-testid=start-screen]")).not.toBeNull();
  });

  it("shows the chooser when prior interviews exist and none was asked for", async () => {
    interviewRows = [{ conversationId: "c1", title: "First", createdAt: "x" }];
    await openTheDoor({ startNew: false });
    expect(container.querySelector("[data-testid=chooser]")).not.toBeNull();
  });

  it("is never blank while the Mandate is still resolving", async () => {
    mandateState = { mandate: null, loading: true, error: null };
    await openTheDoor();
    expect(whatIsOnScreen()).not.toBe("");
  });

  it("is never blank while the Rulebook document is still loading", async () => {
    docState = { ...docState, document: null, loading: true };
    await openTheDoor();
    expect(whatIsOnScreen()).not.toBe("");
  });

  it("is never blank while the interview list is still loading", async () => {
    interviewRows = "never-resolves";
    await openTheDoor();
    expect(whatIsOnScreen()).not.toBe("");
  });

  it("says so in words when no interviewer is bound to the Mandate", async () => {
    mandateState = { mandate: null, loading: false, error: null };
    await openTheDoor();
    expect(container.textContent ?? "").toMatch(/isn't available|isn’t available/);
  });

  it("says so in words when the Mandate lookup itself failed", async () => {
    mandateState = { mandate: null, loading: false, error: "resolution 500" };
    await openTheDoor();
    expect(container.textContent ?? "").toContain("resolution 500");
  });

  it("says so in words, with a way out, when the Rulebook could not be read", async () => {
    docState = {
      ...docState,
      document: null,
      error: "We could not read this Rulebook.",
    };
    await openTheDoor();
    expect(container.textContent ?? "").toContain(
      "We could not read this Rulebook.",
    );
    expect(container.textContent ?? "").toContain("Try again");
  });
});
