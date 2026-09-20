/**
 * THE GUARD for D1 (jobs-bar cold-walk-12, 2026-09-19): New Masterwork step
 * 2's "Start" button must never look live and silently do nothing.
 *
 * ## The defect, as the cold walk hit it
 *
 * Sign in with no organization selected (header shows "Choose org" in red) →
 * `/masterwork/new` → type a goal → Continue → step 2. The footer read
 * "Starting with Talk it through" and Start was enabled, blue and
 * primary-styled. Clicking it produced ZERO network requests of any kind, no
 * console error, and no visible change — `create()`'s hand-rolled workspace
 * wait sat in an `await` OUTSIDE any try/catch, so a rejection there (e.g. a
 * missing feature knob) left every bit of that state exactly as it was before
 * the click. The identical click with an organization selected succeeded in
 * about a second.
 *
 * The owner ruling (Arman, 2026-09-19): there is no default organization, so
 * Start must be either honest-disabled with its reason beside it — the same
 * pattern `Continue` already uses on this very screen — or, with sole
 * membership, silently pre-selected.
 *
 * ## The SUT and what is real
 *
 * `NewRulebookFlow`, `useOrganizationRequired` and `organizationBlockingReason`
 * — the real Redux store (slim root reducer) carries the real `appContext`
 * slice, so "no organization selected" and "sole membership already resolved"
 * are real store states, not a mocked selector. Doubles: Next's router, the
 * Approach registry read, the Rulebook insert.
 *
 * ## Proven red before the fix (2026-09-19)
 *
 * Against the pre-fix `NewRulebookFlow`, "no organization: Start is disabled
 * with the reason beside it" failed — Start rendered `disabled: false` with no
 * reason text on screen, matching the live defect exactly.
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

function approach(key: string, label: string, sortOrder: number): DistillationApproach {
  return {
    id: `id-${key}`,
    key,
    label,
    blurb: `${label} blurb`,
    whatItNeeds: "a few minutes",
    costTimeShape: "start now",
    mandateKey: `masterwork.${key}`,
    intakeQuery: { interview: "1" },
    sortOrder,
    enabled: true,
    availability: "available",
    launchHref: null,
    catalogNumber: sortOrder,
  };
}

const APPROACHES: DistillationApproach[] = [approach("interview", "Talk it through", 1)];

const fetchApproaches = jest.fn<Promise<DistillationApproach[]>, []>();
jest.mock("@/features/masterwork/browse/approaches", () => {
  const actual = jest.requireActual("@/features/masterwork/browse/approaches");
  return { ...actual, fetchDistillationApproaches: () => fetchApproaches() };
});

const createDraftRulebook = jest.fn(async () => ({ id: "r1", name: "A Rulebook" }));
jest.mock("@/features/masterwork/service", () => ({
  createDraftRulebook: (...args: unknown[]) => createDraftRulebook(...args),
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

import { NewRulebookFlow } from "../NewRulebookFlow";

const GOAL = "An assistant that writes the way I write";

let container: HTMLDivElement;
let root: Root;
let store: Store;

/** `preloadedState` puts the real `appContext` slice in one of the three
 *  states `useOrganizationRequired` distinguishes — never a mocked selector. */
function makeStore(appContext: {
  organization_id: string | null;
  orgBootstrapResolved: boolean;
  orgBootstrapFailure?: string | null;
}) {
  return configureStore({
    reducer: createSlimRootReducer(),
    preloadedState: {
      appContext: {
        organization_id: appContext.organization_id,
        organization_name: null,
        organization_settings: null,
        personal_organization_id: null,
        orgBootstrapResolved: appContext.orgBootstrapResolved,
        orgBootstrapFailure: appContext.orgBootstrapFailure ?? null,
      },
    } as never,
  });
}

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

/** The sticky bar's primary action — found by its icon-free text no matter
 *  which of "Start" / "Getting ready…" / "Starting…" it currently reads. */
function startButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    /^(Start|Getting ready…|Starting…)$/.test((b.textContent ?? "").trim()),
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

function screenText(): string {
  return container.textContent ?? "";
}

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
  createDraftRulebook.mockClear();
  fetchApproaches.mockReset();
  fetchApproaches.mockResolvedValue(APPROACHES);
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

it("no organization selected: Start is disabled with the reason beside it, never a silent no-op", async () => {
  store = makeStore({ organization_id: null, orgBootstrapResolved: true });
  await reachStepTwo();

  const start = startButton();
  expect(start?.disabled).toBe(true);
  expect(screenText()).toMatch(/choose a workspace/i);

  // THE FORCING FUNCTION: clicking a disabled button fires no handler at
  // all in a real browser; assert directly that nothing the click would do
  // happened, so a future regression that removes `disabled` cannot pass by
  // accident. `mockPush` already recorded the step-1→2 URL change from
  // `reachStepTwo()`, so it is cleared right before the click under test.
  mockPush.mockClear();
  click(start!);
  await settle();
  expect(createDraftRulebook).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it("sole membership: the organization is pre-selected and Start behaves exactly as before", async () => {
  store = makeStore({ organization_id: ORG_ID, orgBootstrapResolved: true });
  await reachStepTwo();

  const start = startButton();
  expect(start?.disabled).toBe(false);
  expect(screenText()).not.toMatch(/choose a workspace/i);

  click(start!);
  await settle();

  expect(createDraftRulebook).toHaveBeenCalledTimes(1);
  expect(createDraftRulebook).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: ORG_ID }),
  );
  expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/masterwork/r1"));
});

it("boot still resolving: Start is disabled with the honest waiting sentence, never the refusal", async () => {
  store = makeStore({ organization_id: null, orgBootstrapResolved: false });
  await reachStepTwo();

  const start = startButton();
  expect(start?.disabled).toBe(true);
  expect(screenText()).toMatch(/getting your workspace ready/i);
  expect(screenText()).not.toMatch(/choose a workspace/i);
});

it("the organization read failed: Start says so and never blames the person for not picking one", async () => {
  store = makeStore({
    organization_id: null,
    orgBootstrapResolved: true,
    orgBootstrapFailure: "TypeError: Failed to fetch",
  });
  await reachStepTwo();

  const start = startButton();
  expect(start?.disabled).toBe(true);
  expect(screenText()).toMatch(/could not check which workspace/i);
  expect(screenText()).not.toMatch(/choose a workspace/i);
});
