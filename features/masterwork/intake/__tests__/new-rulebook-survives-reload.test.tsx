/**
 * The Masterwork guided start must not lose the Expert's answers on a reload
 * (W43, reproduced on the live build 2026-09-12).
 *
 * SUT: `NewRulebookFlow`. It OWNS: mirroring every answer into the durable
 * wizard draft, putting the WHOLE draft back on a fresh mount (multi-select
 * answers included), and never rendering a complete-looking step 2 out of a
 * draft it has not read or does not have.
 *
 * Real here: the Redux store (slim root reducer), `wizardDraftSlice` and the
 * exact bytes its sync policy persists (`serialize` -> `deserialize` -> the
 * real `sync/rehydrate` action), `useWizardDraft`, `resolveWizardStep`, and
 * the relevance map that builds "Best for what you described". Doubles: Next's
 * router/search params, the Approach registry read, the Rulebook insert, the
 * dictation origin, and the Pro inputs.
 *
 * The reload is simulated the way a reload actually works: the answers are
 * persisted, the tree is thrown away, a NEW store rehydrates from those bytes,
 * and the form is mounted again at the same URL.
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

/** The live registry's own `intake_query` for each of these keys — a fixture
 *  row with no lane cannot exist in `platform.approach`, and the funnel now
 *  (correctly) refuses to offer a Start it has no way to run. */
const LIVE_INTAKE_QUERY: Record<string, Record<string, string>> = {
  interview: { interview: "1" },
  chat_import: { chatImport: "1" },
  source: { ingest: "source" },
};

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
    intakeQuery: LIVE_INTAKE_QUERY[key] ?? { ingest: "source" },
    sortOrder,
    enabled: true,
    availability: "available",
    launchHref: null,
    catalogNumber: sortOrder,
  };
}

const APPROACHES: DistillationApproach[] = [
  approach("interview", "Talk it out", 1),
  approach("chat_import", "Bring in your AI chats", 2),
  approach("source", "Use what you wrote", 3),
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
const createDraftRulebook = jest.fn(
  async (_args: CreateDraftRulebookArgs) => ({
    id: "rulebook-1",
    name: "A Rulebook",
  }),
);
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
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => {
  const actual = jest.requireActual("@/lib/redux/slices/appContextSlice");
  return { ...actual, selectEffectiveOrganizationId: () => ORG_ID };
});

import { NewRulebookFlow } from "../NewRulebookFlow";

const GOAL = "An assistant that writes the way I write";
const KNOWLEDGE_CHOICE = "In my AI chats";

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

/** Only the "Best for what you described" section — the answer-driven row. */
function topRowText(): string {
  const heading = Array.from(container.querySelectorAll("h2")).find(
    (h) => (h.textContent ?? "") === "Best for what you described",
  );
  return heading?.parentElement?.parentElement?.textContent ?? "";
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

function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  act(() => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The bytes the sync engine would have written for this store's drafts. */
function persistDrafts(store: Store): unknown {
  const state = store.getState() as { wizardDraft: WizardDraftState };
  return wizardDraftPolicy.config.serialize!(state.wizardDraft);
}

/** A brand-new store that rehydrates from those bytes — i.e. a reload. */
function storeAfterReload(persisted: unknown): Store {
  const store = makeStore();
  const body = wizardDraftPolicy.config.deserialize!(persisted);
  act(() => {
    store.dispatch(
      buildRehydrateAction("wizardDraft", body, { fromRehydrate: true }),
    );
  });
  return store;
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockPush.mockClear();
  createDraftRulebook.mockClear();
});

async function fillStepOne(store: Store) {
  mount(store);
  type(
    container.querySelector<HTMLTextAreaElement>('[data-testid="goal"]')!,
    GOAL,
  );
  // Where the knowledge lives is a MULTI-select, and tapping ADDS to the
  // pre-selected default — so the saved value is the joined set
  // "In my head | In my AI chats". That joined string is exactly what the old
  // restorer could not validate, and it dropped the whole answer in silence.
  const choice = buttonWith(KNOWLEDGE_CHOICE);
  expect(choice).toBeDefined();
  click(choice!);
  click(buttonWith("Continue")!);
  expect(mockPush).toHaveBeenCalledWith("/masterwork/new?step=2");
}

it("puts the goal AND the multi-select answer back after a reload on ?step=2", async () => {
  const store = makeStore();
  await fillStepOne(store);
  const persisted = persistDrafts(store);
  unmount();

  // --- the reload ---
  mockSearchParams = new URLSearchParams("step=2");
  const reloaded = storeAfterReload(persisted);
  mount(reloaded);
  await act(async () => {
    await Promise.resolve();
  });

  const text = container.textContent ?? "";
  // Step 2 rendered, and it was built from what she actually said: the
  // AI-chats answer puts the chat-import Approach in the TOP row. Before this
  // guard the joined multi-select value failed option validation, the answer
  // fell back to "In my head", and the top row showed the interview Approach.
  expect(text).toContain("Best for what you described");
  // The chat-import Approach is in the top row BECAUSE she said her knowledge
  // lives in her AI chats. With the answer dropped back to the "In my head"
  // default (the old behaviour) chat-import is not relevant at all and never
  // appears there.
  expect(topRowText()).toContain("Bring in your AI chats");
  expect(text).not.toContain("We could not find");

  // And the goal survived — pressing Start creates a Rulebook that has it.
  click(buttonWith("Start")!);
  await act(async () => {
    await Promise.resolve();
  });
  expect(createDraftRulebook).toHaveBeenCalledTimes(1);
  const arg = createDraftRulebook.mock.calls[0][0];
  expect(arg.description).toBe(GOAL);
  expect(arg.intake.goal).toBe(GOAL);
  expect(arg.intake.knowledge_lives).toContain(KNOWLEDGE_CHOICE);
  unmount();
});

it("never renders a complete-looking step 2 when the draft is gone", async () => {
  mockSearchParams = new URLSearchParams("step=2");
  mount(makeStore());
  await act(async () => {
    await Promise.resolve();
  });

  const text = container.textContent ?? "";
  expect(text).not.toContain("Best for what you described");
  expect(text).toContain("We could not find what you told us");
  expect(buttonWith("Start again")).toBeDefined();
  unmount();
});
