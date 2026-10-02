/**
 * GUARD — the duplicate-name notice still tells her how the start goes
 * (cold walk 23 leftover, 2026-09-30).
 *
 * 07a74815ab shortened the duplicate-name notice to one sentence plus a
 * Rename button and dropped the Approach's start line ("Start now — your
 * first rules appear within minutes."), which every ordinary start shows. A
 * duplicate start is the same start plus one fact; it must carry the same
 * start information.
 *
 * SUT: the real NewRulebookFlow start path and its recordToast call. Doubles:
 * router, Approach registry read, Rulebook insert, toast sink.
 *
 * RED before the fix: the duplicate case's description was "You already have
 * a Rulebook with this name." with no start line.
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

// The longest live platform.approach.cost_time_shape for the distillation
// family (teach_back, 103 chars, read on the clone 2026-09-30).
const LONGEST_START_LINE =
  "About a minute of listening per round, and as long as it takes you to interrupt — usually a few rounds.";

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
    costTimeShape: LONGEST_START_LINE,
    mandateKey: `masterwork.${key}` as AnyMandateKey,
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

let nameAlreadyInUse = false;
const createDraftRulebook = jest.fn(async (_input?: unknown) => ({
  id: "r1",
  name: "walk23-Recoat or Resand Verdict",
  nameAlreadyInUse,
}));
jest.mock("@/features/masterwork/service", () => ({
  createDraftRulebook: (input: unknown) => createDraftRulebook(input),
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

const recordSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), dismiss: jest.fn() },
  recordToast: {
    success: (...a: unknown[]) => recordSuccess(...a),
    error: jest.fn(),
  },
}));

import { NewRulebookFlow } from "../NewRulebookFlow";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";

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
  recordSuccess.mockClear();
  createDraftRulebook.mockClear();
  fetchApproaches.mockReset();
  fetchApproaches.mockResolvedValue(APPROACHES);
  store = makeStore({ organization_id: ORG_ID, orgBootstrapResolved: true });
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

async function startAndReadNotice() {
  await reachStepTwo();
  click(startButton()!);
  await settle();
  expect(recordSuccess).toHaveBeenCalledTimes(1);
  return recordSuccess.mock.calls[0][2] as {
    description: string;
    action?: { label: string };
  };
}

it("an ordinary start shows the Approach's start line", async () => {
  nameAlreadyInUse = false;
  const notice = await startAndReadNotice();
  expect(notice.description).toBe(LONGEST_START_LINE);
});

it("a duplicate-name start shows the same start line, plus Rename, within the slot budget", async () => {
  nameAlreadyInUse = true;
  const notice = await startAndReadNotice();
  expect(notice.description).toContain(LONGEST_START_LINE);
  expect(notice.description).toMatch(/already have one with this name/);
  expect(notice.action?.label).toBe("Rename");
  // Toast/dialog description slot: ≤ 140 chars, at most two sentences.
  expect(notice.description.length).toBeLessThanOrEqual(140);
});

it("a registry start line longer than today's still yields a notice inside the slot", async () => {
  nameAlreadyInUse = true;
  const longer = `${LONGEST_START_LINE} Then go.`;
  const saved = APPROACHES[0].costTimeShape;
  APPROACHES[0].costTimeShape = longer;
  try {
    const notice = await startAndReadNotice();
    expect(notice.description.length).toBeLessThanOrEqual(140);
    expect(notice.description).toContain(longer);
    expect(notice.action?.label).toBe("Rename");
  } finally {
    APPROACHES[0].costTimeShape = saved;
  }
});

// Review follow-up: the full notice is exactly 140 with today's longest row, so
// a longer registry row must degrade, never overflow. RED before: the notice
// was a bare template and a 130-character start line made it 167.
describe("the notice stays inside its slot whatever the registry says", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { duplicateStartNotice, NOTICE_SLOT_CHARS } = require("../duplicateStartNotice") as typeof import("../duplicateStartNotice");

  it("today's longest line keeps the full sentence", () => {
    expect(duplicateStartNotice(LONGEST_START_LINE)).toBe(
      `You already have one with this name. ${LONGEST_START_LINE}`,
    );
  });

  it("a longer line keeps the whole start line behind the short sentence", () => {
    const longer = `${LONGEST_START_LINE} Then go.`;
    const notice = duplicateStartNotice(longer);
    expect(notice.length).toBeLessThanOrEqual(NOTICE_SLOT_CHARS);
    expect(notice).toBe(`Same name as one you have. ${longer}`);
  });

  it("an overlong line is cut at a word, never past the slot", () => {
    const overlong = `${LONGEST_START_LINE} ${LONGEST_START_LINE}`;
    const notice = duplicateStartNotice(overlong);
    expect(notice.length).toBeLessThanOrEqual(NOTICE_SLOT_CHARS);
    expect(notice.startsWith("Same name as one you have. About a minute")).toBe(true);
    expect(notice.endsWith("…")).toBe(true);
  });
});
