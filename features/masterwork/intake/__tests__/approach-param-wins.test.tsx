/**
 * THE GUARD for census defect D3: `?approach=` must decide which card is
 * selected — a stale previous pick may never survive it.
 *
 * ## The defect
 *
 * `/masterwork/new` seeded its selection from `?approach=` at MOUNT only.
 * `/masterwork/new` is ONE route, so arriving from the Approach catalog a
 * second time is a client-side navigation that does not remount: the new
 * param was read into nothing, and the card the Expert had picked a minute
 * ago stayed highlighted. Pressing Start then began the WRONG lane while the
 * screen said the right one had been chosen — observed live on 2026-09-12
 * with `?approach=body_of_work` leaving "From examples of your best work"
 * selected (census REGISTER.md, D3).
 *
 * ## The SUT and what is real
 *
 * `NewRulebookFlow` owns the precedence. Real: the component, the Redux store
 * and the wizard draft, the relevance map. Doubles: Next's router/search
 * params (the param is the input under test), the registry read, the Rulebook
 * insert — the same harness as `new-rulebook-survives-reload.test.tsx`.
 *
 * Proven red before green (2026-09-12): without the param-change effect this
 * suite fails with `exemplar` where `body_of_work` is expected.
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
  approach("body_of_work", "Everything you've published", 3, {
    body_of_work: "1",
  }),
];

jest.mock("@/features/masterwork/browse/approaches", () => {
  const actual = jest.requireActual("@/features/masterwork/browse/approaches");
  return {
    ...actual,
    fetchDistillationApproaches: jest.fn(async () => APPROACHES),
  };
});

interface CreateDraftRulebookArgs {
  name: string;
  description: string;
  intake: Record<string, string>;
}
const createDraftRulebook = jest.fn(async (_args: CreateDraftRulebookArgs) => ({
  id: "rulebook-1",
  name: "A Rulebook",
}));
jest.mock("@/features/masterwork/service", () => ({
  createDraftRulebook: (args: CreateDraftRulebookArgs) =>
    createDraftRulebook(args),
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
  toast: { error: jest.fn(), success: jest.fn() },
  recordToast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => {
  const actual = jest.requireActual("@/lib/redux/slices/appContextSlice");
  return { ...actual, selectEffectiveOrganizationId: () => ORG_ID };
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
  });
}

/** Navigate the way the app does: the URL changes, the page does NOT remount. */
async function navigate(query: string) {
  mockSearchParams = new URLSearchParams(query);
  render();
  await settle();
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockPush.mockClear();
  createDraftRulebook.mockClear();
  store = configureStore({ reducer: createSlimRootReducer() });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("a new ?approach= wins over the card the Expert selected a moment ago", async () => {
  render();
  type(container.querySelector<HTMLTextAreaElement>('[data-testid="goal"]')!, GOAL);
  click(buttonWith("Continue")!);
  await navigate("step=2");

  // She picks one card by hand…
  const exemplarCard = buttonWith("From examples of your best work");
  expect(exemplarCard).toBeDefined();
  click(exemplarCard!);
  await settle();

  // …then goes back out to the catalog and starts a DIFFERENT Approach. Same
  // route, so no remount — exactly the navigation that used to be ignored.
  await navigate("step=2&approach=body_of_work");

  click(buttonWith("Start")!);
  await settle();

  expect(createDraftRulebook).toHaveBeenCalledTimes(1);
  expect(createDraftRulebook.mock.calls[0][0].intake.approach).toBe(
    "body_of_work",
  );
});

it("an in-page pick still wins while the param stays put", async () => {
  render();
  type(container.querySelector<HTMLTextAreaElement>('[data-testid="goal"]')!, GOAL);
  click(buttonWith("Continue")!);
  await navigate("step=2&approach=body_of_work");

  // The param put us on body_of_work; she changes her mind on the page. The
  // param has not changed, so it must not overrule her.
  click(buttonWith("From examples of your best work")!);
  await settle();
  click(buttonWith("Start")!);
  await settle();

  expect(createDraftRulebook).toHaveBeenCalledTimes(1);
  expect(createDraftRulebook.mock.calls[0][0].intake.approach).toBe("exemplar");
});
