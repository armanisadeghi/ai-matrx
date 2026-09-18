/**
 * A RULEBOOK PAGE SHOWS *THAT RULEBOOK'S* WORDS — NEVER THE PREVIOUS ONE'S.
 *
 * The second cold walk of 2026-09-16 (jobs-bar, finding #1) reported filling in
 * the Capture Plan on one Rulebook and having the work land on another. Run
 * down against the live rows, the WRITE was clean — but the walk's own closing
 * lead was not: `CapturePlanPage` seeds its goal field from
 * `rulebook.description` in a `useState` initialiser, and a Rulebook→Rulebook
 * navigation keeps the same mounted component instance (one element position,
 * one prop change). So Rulebook B's plan form opened carrying Rulebook A's
 * sentence — indistinguishable, from the Expert's seat, from the cross-record
 * write they thought they were seeing. The scaffold made it worse by holding
 * the previous Rulebook in state while the next one loaded, so the old row's
 * name and rules really did render under the new URL for a beat.
 *
 * THE PRODUCTION CHANGE THAT MAKES THIS FAIL: removing the `key={rulebookId}`
 * from either rulebook-scoped page scaffold —
 * `features/masterwork/components/RulebookLaneRoute.tsx` (all 14 lane routes)
 * or `features/masterwork/components/detail/RulebookDetailPage.tsx` — or
 * reintroducing the class inside a lane by deriving state from the Rulebook
 * once and never again. Proven RED against exactly that: with the key removed
 * the second Rulebook's form opens holding the first Rulebook's sentence.
 *
 * THE SCENARIO IS THE COLD WALK'S OWN: two Rulebooks opened IN SEQUENCE in one
 * mounted app. Nothing remounts between them — one `createRoot`, one module
 * instance — which is the only way a carried-over initialiser can show itself.
 *
 * WHAT IS REAL (never stubbed): `RulebookLaneRoute`, `CapturePlanPage`, the
 * real `getRulebook` read, the real knob ladder, the real Redux store. Only the
 * wire is faked (`./rulebookWire`), and the assertion is the text a person
 * would read off the screen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeStore } from "@/lib/redux/store";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";
import { CapturePlanPage } from "@/features/masterwork/capture-plan/CapturePlanPage";

import {
  installMatchMedia,
  RULEBOOK_A,
  RULEBOOK_B,
  rulebookRow,
  rulebookRows,
  USER_ID,
} from "./rulebookWire";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/supabase/client", () => require("./rulebookWire").supabaseWire);

jest.mock(
  "@/features/scopes/service/associationsService",
  () => require("./rulebookWire").associationsWire,
);

jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: (...args: [string, string | null, string]) =>
    require("./rulebookWire").knobWire.ensureEffectiveKnob(...args),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: () => Promise.resolve({ queued: 0, superseded: 0, problem: null }),
}));

jest.mock("@/features/organizations/service", () => ({
  getOrganization: (id: string) => Promise.resolve({ id, name: "The Desk" }),
}));

// ── presentational chrome, and nothing that decides what the page shows ─────
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  ChevronLeftTapButton: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => <div>access gate</div>,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSurfaceClientTools: () => undefined,
  useSurfaceWriteHandlers: () => undefined,
}));
jest.mock("@/features/masterwork/components/detail/RuleEditorDialog", () => ({
  RuleEditorDialog: () => null,
}));
jest.mock("@/features/masterwork/capture-plan/SessionHost", () => ({
  OpenSessionButton: () => null,
  SessionHost: () => null,
  resolveSessionDoor: () => null,
}));
jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}));

const NAME_A = "Commercial teardown pricing — field notes";
const NAME_B = "Commercial teardown pricing — field guide";

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeAll(() => {
  installMatchMedia();
  jest.useFakeTimers();
  store = makeStore();
  store.dispatch({ type: "userAuth/setUserAuth", payload: { id: USER_ID } });
  rulebookRows.set(RULEBOOK_A, rulebookRow(RULEBOOK_A, NAME_A));
  rulebookRows.set(RULEBOOK_B, rulebookRow(RULEBOOK_B, NAME_B));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Render the plan lane THE WAY THE ROUTE DOES — `params.id` in, nothing else. */
function renderPlanLane(rulebookId: string): void {
  root.render(
    <Provider store={store}>
      <TooltipProvider>
        <RulebookLaneRoute
          rulebookId={rulebookId}
          lane="plan"
          title="Your capture plan"
          body="scroll"
        >
          {({ rulebook, canEdit, setRulebook, reload }) => (
            <CapturePlanPage
              rulebook={rulebook}
              canEdit={canEdit}
              setRulebook={setRulebook}
              reload={reload}
            />
          )}
        </RulebookLaneRoute>
      </TooltipProvider>
    </Provider>,
  );
}

/** A navigation: same root, same module instance, new id. */
async function openPlanLane(rulebookId: string): Promise<void> {
  await act(async () => {
    renderPlanLane(rulebookId);
  });
  await settle();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

function goalBox(): HTMLTextAreaElement {
  const box = container.querySelector<HTMLTextAreaElement>("#cp-goal");
  if (!box) {
    throw new Error(
      `The goal field is not on screen — the lane rendered: ${container.textContent?.slice(0, 400)}`,
    );
  }
  return box;
}

function typeIntoGoal(text: string): void {
  const box = goalBox();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// ── the guard ───────────────────────────────────────────────────────────────

it("opens the next Rulebook's plan form on the next Rulebook's own words", async () => {
  await openPlanLane(RULEBOOK_A);
  expect(goalBox().value).toBe(`How I decide what to do about ${NAME_A}.`);

  // 🚨 THE COLD WALK'S MOVE: the same mounted app, now on the other Rulebook
  // with the near-identical name.
  await openPlanLane(RULEBOOK_B);

  expect(goalBox().value).toBe(`How I decide what to do about ${NAME_B}.`);
  // Said the other way round, because this is what the Expert actually saw:
  // the previous Rulebook's sentence is nowhere on the new Rulebook's page.
  expect(container.textContent).not.toContain(NAME_A);
});

it("does not render the previous Rulebook underneath the next Rulebook's URL", async () => {
  await openPlanLane(RULEBOOK_A);
  expect(container.textContent).toContain(NAME_A);

  // The id changes: from that render on, the previous Rulebook's row is never
  // what the new URL serves. (The test wire answers the read inside this same
  // flush, so what lands here is B already opened rather than the "Opening
  // your capture plan…" state a real network shows first — either is right;
  // A's row surviving under B's URL is what is not.)
  await act(async () => {
    renderPlanLane(RULEBOOK_B);
  });

  expect(container.textContent).not.toContain(NAME_A);
  expect(goalBox().value).toBe(`How I decide what to do about ${NAME_B}.`);

  await settle();
  expect(goalBox().value).toBe(`How I decide what to do about ${NAME_B}.`);
});

it("never carries an unsaved edit from one Rulebook into another", async () => {
  await openPlanLane(RULEBOOK_B);
  typeIntoGoal("Which pallets I pull for a manual sort, and why.");
  expect(goalBox().value).toBe("Which pallets I pull for a manual sort, and why.");

  await openPlanLane(RULEBOOK_A);

  expect(goalBox().value).toBe(`How I decide what to do about ${NAME_A}.`);
});

/**
 * THE CENSUS HALF. The lane scaffold above is driven for real; the Rulebook
 * DETAIL page (`/masterwork/<id>`) is the other rulebook-scoped page scaffold in
 * this module and carries the same class — an open rule editor, a search box, a
 * chosen KPI view and a staged draft all derived from the Rulebook it first
 * mounted on. It does not stand up in jsdom (it mounts the whole detail surface:
 * agent runtime, durable runs, a dozen dialogs), so its half of the class is
 * held by reading the source. Stated plainly rather than implied: this asserts
 * the keying is THERE, not that it behaves — the behaviour is proven on the lane
 * scaffold, which is the same one-line mechanism.
 */
it("keys both rulebook-scoped page scaffolds by the record they show", () => {
  const read = (rel: string) =>
    readFileSync(path.join(__dirname, "..", rel), "utf8");

  expect(read("components/RulebookLaneRoute.tsx")).toContain(
    "<RulebookLaneRouteInstance key={props.rulebookId} {...props} />",
  );
  expect(read("components/detail/RulebookDetailPage.tsx")).toContain(
    "<RulebookDetailPageInstance key={rulebookId} rulebookId={rulebookId} />",
  );
});
