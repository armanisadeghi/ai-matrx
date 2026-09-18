/**
 * THE GUARD for wall W2 (census CENSUS-2026-09-15.md, row W2): a failed
 * Approach read must reach a real error state with a working retry, and must
 * never print the database engine's own words at the Expert.
 *
 * ## The defect, as a user-driver hit it on 2026-09-15
 *
 * `/masterwork/new?approach=interview`, step 2 of 2. The registry read timed
 * out and the page printed, verbatim, under "Pick how you'd like to do this":
 *
 *     canceling statement due to statement timeout (57014)
 *
 * Pressing "Try again" cleared that text and left FOUR CARD-SHAPED SKELETONS
 * that never resolved, with Start permanently disabled. No error, no remedy,
 * no way forward.
 *
 * The retry was the deadlock. The load effect was gated on its own result
 * (`if (approaches !== null) return;`, deps `[approaches]`) and the button ran
 * `setApproaches(null)` — a write of the value the state ALREADY held, because
 * the failed load never set it. React bailed out, the dependency never changed,
 * the effect never re-ran, and the page fell back to its loading branch
 * forever. A retry that is an assignment is not a retry; it must be an event.
 *
 * ## The SUT and what is real
 *
 * `NewRulebookFlow` and the `useApproachRegistry` loader it now shares with the
 * catalog page and the add-to-Rulebook dialog. Real: both of those, the wizard
 * step resolver, the draft, the Redux store, the failure sentence table in
 * `lib/failure/transport.ts`. Doubles: Next's router (there is no router in
 * jsdom), the Rulebook insert, and `fetchDistillationApproaches` — the network
 * boundary, which is the input under test. Nothing the SUT owns is stubbed:
 * the retry wiring, the render branch order and the choice of sentence are all
 * live.
 *
 * ## Why a constant cannot pass
 *
 * Four inputs with four different expected screens: a read that fails and
 * stays failed (error, no skeleton, no engine prose), a read that fails and
 * then succeeds (cards, Start enabled, no error), and a read that succeeds
 * first time (cards, and the registry asked exactly once).
 *
 * ## Proven red before green (2026-09-15)
 *
 * Against the pre-fix `NewRulebookFlow`, "asking again actually asks again"
 * fails with 1 call where 2 are expected, "a failed RETRY never leaves the
 * Expert on skeletons forever" fails with 4 skeletons on screen, and
 * and "never prints the engine's own words" fails on the rendered
 * `canceling statement due to statement timeout`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import type { DistillationApproach } from "@/features/masterwork/browse/approaches";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

let mockSearchParams = new URLSearchParams();
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/masterwork/new",
}));

function approach(
  key: string,
  label: string,
  sortOrder: number,
  intakeQuery: Record<string, string>,
): DistillationApproach {
  return {
    id: `id-${key}`,
    key,
    label,
    blurb: `${label} blurb`,
    whatItNeeds: "a few minutes",
    costTimeShape: "start now",
    mandateKey: `masterwork.${key}`,
    intakeQuery,
    sortOrder,
    enabled: true,
    availability: "available",
    launchHref: null,
    catalogNumber: sortOrder,
  };
}

const APPROACHES: DistillationApproach[] = [
  approach("interview", "Talk it out", 1, { interview: "1" }),
  approach("exemplar", "From examples of your best work", 2, {
    ingest: "exemplar",
  }),
];

/**
 * The error the live wall produced, in the shape the registry read rethrows it:
 * the engine's message, with its SQLSTATE riding alongside rather than folded
 * into the prose.
 */
function theWall(): Error {
  const err = new Error("canceling statement due to statement timeout");
  err.name = "ApproachRegistryError";
  return Object.assign(err, { code: "57014" });
}

const fetchApproaches = jest.fn<Promise<DistillationApproach[]>, []>();

jest.mock("@/features/masterwork/browse/approaches", () => {
  const actual = jest.requireActual("@/features/masterwork/browse/approaches");
  return { ...actual, fetchDistillationApproaches: () => fetchApproaches() };
});

jest.mock("@/features/masterwork/service", () => ({
  createDraftRulebook: jest.fn(async () => ({ id: "r1", name: "A Rulebook" })),
}));

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea
      data-testid="goal"
      value={props.value as string}
      onChange={props.onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
    />
  ),
}));
jest.mock("@/components/official/ProInput", () => ({
  ProInput: (props: Record<string, unknown>) => (
    <input
      data-testid="name"
      value={props.value as string}
      onChange={props.onChange as React.ChangeEventHandler<HTMLInputElement>}
    />
  ),
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), dismiss: jest.fn() },
  recordToast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => {
  const actual = jest.requireActual("@/lib/redux/slices/appContextSlice");
  return { ...actual, selectOrganizationId: () => ORG_ID };
});

import { NewRulebookFlow } from "../NewRulebookFlow";

const GOAL = "An assistant that writes the way I write";

let container: HTMLDivElement;
let root: Root;
let store: Store;

function render() {
  act(() => {
    root.render(
      <Provider store={store}>
        <NewRulebookFlow />
      </Provider>,
    );
  });
}

function buttonWith(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** How many card-shaped loading placeholders the Expert is looking at. */
function skeletons(): number {
  return container.querySelectorAll('[aria-busy="true"] .animate-pulse').length;
}

function screenText(): string {
  return container.textContent ?? "";
}

/** Drive the wizard to step 2 exactly as the Expert does. */
async function reachStepTwo() {
  render();
  type(
    container.querySelector<HTMLTextAreaElement>('[data-testid="goal"]')!,
    GOAL,
  );
  click(buttonWith("Continue")!);
  mockSearchParams = new URLSearchParams("approach=interview&step=2");
  render();
  await settle();
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams("approach=interview");
  mockPush.mockClear();
  fetchApproaches.mockReset();
  store = configureStore({ reducer: createSlimRootReducer() });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

it("never prints the database engine's own words at the Expert", async () => {
  fetchApproaches.mockRejectedValue(theWall());
  await reachStepTwo();

  expect(screenText()).not.toContain("canceling statement");
  expect(screenText()).not.toContain("57014");
  expect(screenText()).not.toContain("statement timeout");
  // And it says something she can act on instead.
  expect(screenText()).toMatch(/took too long/i);
  expect(screenText()).toMatch(/try again/i);
});

it("a failed load never rests on a skeleton — it reaches an error state", async () => {
  fetchApproaches.mockRejectedValue(theWall());
  await reachStepTwo();

  expect(skeletons()).toBe(0);
  expect(buttonWith("Try again")).toBeDefined();
  // Start cannot be pressed, and the screen says why — it is not a dead button
  // beside four placeholders that will never resolve.
  expect(buttonWith("Start")?.disabled).toBe(true);
});

it("a failed RETRY never leaves the Expert on skeletons forever", async () => {
  // THE WALL ITSELF. Pre-fix, this is the state the user-driver was stranded
  // in: the error text gone, four card-shaped placeholders that never resolve,
  // Start permanently disabled, and nothing left to press.
  fetchApproaches.mockRejectedValue(theWall());
  await reachStepTwo();
  click(buttonWith("Try again")!);
  await settle();

  expect(skeletons()).toBe(0);
  expect(screenText()).toMatch(/took too long/i);
  expect(buttonWith("Try again")).toBeDefined();
});

it("asking again actually asks again, and clears the wall when it works", async () => {
  fetchApproaches.mockRejectedValueOnce(theWall());
  await reachStepTwo();
  expect(fetchApproaches).toHaveBeenCalledTimes(1);

  fetchApproaches.mockResolvedValueOnce(APPROACHES);
  click(buttonWith("Try again")!);
  await settle();

  // THE forcing function: the pre-fix page never made this second call.
  expect(fetchApproaches).toHaveBeenCalledTimes(2);
  expect(skeletons()).toBe(0);
  expect(screenText()).toContain("Talk it out");
  expect(screenText()).toContain("From examples of your best work");
  expect(screenText()).not.toMatch(/took too long/i);
  expect(buttonWith("Start")?.disabled).toBe(false);
});

it("a clean read shows the cards and asks the registry exactly once", async () => {
  fetchApproaches.mockResolvedValue(APPROACHES);
  await reachStepTwo();

  expect(fetchApproaches).toHaveBeenCalledTimes(1);
  expect(skeletons()).toBe(0);
  expect(screenText()).toContain("Talk it out");
  expect(buttonWith("Try again")).toBeUndefined();
  expect(buttonWith("Start")?.disabled).toBe(false);
});
