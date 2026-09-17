/**
 * A RESTORED WIZARD DRAFT IS ANNOUNCED ON SCREEN — NEVER SLIPPED BACK IN.
 *
 * Cold walk 6, 2026-09-17, reproduced live on /masterwork/new: an Expert typed
 * her goal, went to look at the catalog, and came back. The textarea already
 * held the old sentence and NOTHING on screen said so. She read it as the page
 * she still had to fill in, clicked where her eye landed and typed her sentence
 * INTO the old one — `prefix + whole sentence + suffix`, 286 characters from a
 * 143-character sentence, straight into `platform.rulebook.description` and
 * `metadata.intake.goal`, and the Capture Plan faithfully displayed the mess.
 *
 * SUT: `NewRulebookFlow` over the real `useWizardDraft` primitive. Real here:
 * the Redux store (slim root reducer), `wizardDraftSlice` and the exact bytes
 * its sync policy persists (`serialize` -> `deserialize` -> the real
 * `sync/rehydrate` action), `useWizardDraft`, and `WizardDraftRestored`.
 * Doubles: Next's router/search params, the Approach registry read, the
 * Rulebook insert, the dictation origin and the Pro inputs.
 *
 * The abandon-and-return is performed the way it actually happens: the answers
 * are persisted, the tree is thrown away, a NEW store rehydrates from those
 * bytes, and the form is mounted again at step 1.
 *
 * The second test is the CLASS: every wizard that restores a persisted draft
 * must render the shared notice. A new wizard that pre-fills itself in silence
 * fails here on the day it is written.
 */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  wizardDraftPolicy,
  type WizardDraftState,
} from "@/lib/redux/slices/wizardDraftSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";
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
): DistillationApproach {
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

jest.mock("@/features/masterwork/browse/approaches", () => {
  const actual = jest.requireActual("@/features/masterwork/browse/approaches");
  return {
    ...actual,
    fetchDistillationApproaches: jest.fn(async () => [
      approach("interview", "Talk it out", 1),
    ]),
  };
});

jest.mock("@/features/masterwork/service", () => ({
  createDraftRulebook: jest.fn(async () => ({ id: "rb-1", name: "A Rulebook" })),
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
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => {
  const actual = jest.requireActual("@/lib/redux/slices/appContextSlice");
  return { ...actual, selectEffectiveOrganizationId: () => ORG_ID };
});

import { NewRulebookFlow } from "@/features/masterwork/intake/NewRulebookFlow";

const GOAL =
  "An assistant that decides, exactly the way I do, which incoming pallets of e-waste need a manual sort";

let container: HTMLDivElement;
let root: Root;

function makeStore(): Store {
  return configureStore({ reducer: createSlimRootReducer() });
}

function mount(store: Store) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <NewRulebookFlow />
      </Provider>,
    );
  });
}

function unmount() {
  act(() => root.unmount());
  container.remove();
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

function goalField(): HTMLTextAreaElement {
  return container.querySelector<HTMLTextAreaElement>('[data-testid="goal"]')!;
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

function persistDrafts(store: Store): unknown {
  const state = store.getState() as { wizardDraft: WizardDraftState };
  return wizardDraftPolicy.config.serialize!(state.wizardDraft);
}

function storeAfterReturn(persisted: unknown): Store {
  const store = makeStore();
  const body = wizardDraftPolicy.config.deserialize!(persisted);
  act(() => {
    store.dispatch(
      buildRehydrateAction("wizardDraft", body, { fromRehydrate: true }),
    );
  });
  return store;
}

/** Type a goal, then walk away without pressing Start. */
function abandon(): unknown {
  const store = makeStore();
  mount(store);
  type(goalField(), GOAL);
  const persisted = persistDrafts(store);
  unmount();
  return persisted;
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockPush.mockClear();
});

it("says on screen that it put the abandoned goal back", async () => {
  const persisted = abandon();

  // --- she comes back to /masterwork/new ---
  mount(storeAfterReturn(persisted));
  await act(async () => {
    await Promise.resolve();
  });

  // The field is pre-filled...
  expect(goalField().value).toBe(GOAL);
  // ...and the page SAYS SO, in words a non-technical Expert reads once.
  const text = container.textContent ?? "";
  expect(text).toContain("We put back what you started writing here last time");
  expect(buttonWith("Start fresh")).toBeDefined();
  unmount();
});

it("'Start fresh' empties the field and the draft does not come back", async () => {
  const persisted = abandon();
  const store = storeAfterReturn(persisted);
  mount(store);
  await act(async () => {
    await Promise.resolve();
  });

  click(buttonWith("Start fresh")!);
  await act(async () => {
    await Promise.resolve();
  });

  // The words are gone from the field — a notice that leaves the old sentence
  // in place is not a remedy — and the notice itself is gone with them.
  expect(goalField().value).toBe("");
  expect(container.textContent ?? "").not.toContain("We put back what you");
  // And the saved draft is gone, so nothing puts it back on the next visit.
  const after = store.getState() as { wizardDraft: WizardDraftState };
  expect(after.wizardDraft.drafts["masterwork-new"]).toBeUndefined();
  unmount();
});

it("every wizard that restores a persisted draft renders the notice", () => {
  // THE CLASS. `useWizardDraft` is the one way to hold a multi-step form's
  // answers; any file that holds them must also be able to say it put them
  // back. This is a census, so the next wizard cannot repeat the walk-6 bug.
  const repoRoot = path.resolve(__dirname, "../../..");
  // The census as of 2026-09-17. A new name here is a new wizard: give it the
  // notice, then add it. Reaching around the primitive straight into the slice
  // counts too — `selectWizardDraft` is in the pattern.
  const consumers = [
    "features/masterwork/components/detail/RuleEditorDialog.tsx",
    "features/masterwork/intake/NewRulebookFlow.tsx",
    "features/research/components/init/ResearchInitForm.tsx",
  ];
  const {
    execFileSync,
  } = require("node:child_process") as typeof import("node:child_process");
  const found = execFileSync(
    "git",
    [
      "grep",
      "-l",
      "-E",
      "useWizardDraft|selectWizardDraft",
      "--",
      "features/**/*.tsx",
      "app/**/*.tsx",
      "components/**/*.tsx",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__") && !f.endsWith(".test.tsx"));
  expect(found.sort()).toEqual(consumers.slice().sort());

  for (const file of found) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    expect({ file, rendersNotice: source.includes("<WizardDraftRestored") }).toEqual({
      file,
      rendersNotice: true,
    });
  }
});
