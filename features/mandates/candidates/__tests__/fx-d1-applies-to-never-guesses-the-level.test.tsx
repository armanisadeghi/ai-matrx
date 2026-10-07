/**
 * FX-D1 — the set-candidate dialog's "Applies to" picker never pre-selects a
 * level it does not KNOW is the live one.
 *
 * Defect: with no organization selected (or a failed live-holder read) the
 * picker fell back to the seat's rung — "Personal" — about 11 ms after open,
 * and "Start collecting" was clickable on that guess. Required: waiting state
 * while the read runs; no selection + Start unavailable when the read cannot
 * answer; the person's own pick is always honoured.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lacks these; the real picker (Radix Select) calls them when it opens.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: () => Promise.resolve({ data: 3, error: null }) }),
  },
}));
const stableDispatch = jest.fn();
let activeOrg: string | null = null;
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => stableDispatch,
  useAppSelector: (selector: unknown) => {
    const { selectOrganizationId } = jest.requireActual("@/lib/redux/slices/appContextSlice");
    return selector === selectOrganizationId ? activeOrg : "user-1";
  },
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/bindings/HolderAssignment", () => ({ HolderAssignment: () => null }));
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));
const mandateHolder = jest.fn();
jest.mock("@ai-matrx/chat/mandates/useMandateHolder", () => ({ useMandateHolder: () => mandateHolder() }));
const setLiveCandidate = jest.fn();
jest.mock("@/features/mandates/candidate-dialog/api", () => ({
  COVERED_DOORS: ["chat_start", "run_mandate"],
  candidateFailureSentence: (e: unknown) => String(e),
  fetchLiveCandidates: () =>
    Promise.resolve({
      active: null,
      open: [],
      history: [],
      forecast: { doors: {}, eligible_of_recent: [0, 0], window_days: 30 },
    }),
  setLiveCandidate: (...a: unknown[]) => setLiveCandidate(...a),
}));

import { SetCandidateDialog } from "@/features/mandates/candidate-dialog/SetCandidateDialog";

jest.setTimeout(60_000);

// A COMPLETE target, so the only thing that can hold Start back is the level.
const TARGET = {
  kind: "agent",
  agentId: "a-new",
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
  workflowVersionId: null,
} as const;

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  document.body.innerHTML = "";
  jest.clearAllMocks();
  activeOrg = null;
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function mountDialog() {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <SetCandidateDialog
        mandateKey={"v2verify.errors" as never}
        mandateName="Errors"
        rung={{ rung: "user", principalId: "user-1" }}
        followLiveRung
        initialTarget={TARGET as never}
        onClose={() => undefined}
      />,
    );
  });
  await flush();
}

const trigger = () => document.body.querySelector<HTMLElement>('[aria-label="Applies to"]')!;
const start = () => document.body.querySelector<HTMLButtonElement>('[data-testid="set-candidate-confirm"]')!;

/** Pick a level the way a person does: open the picker, choose the option. */
async function pick(label: RegExp) {
  await act(async () => {
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await flush();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
    label.test(o.textContent ?? ""),
  );
  expect(option).toBeDefined();
  await act(async () => {
    option!.click();
  });
  await flush();
}

describe("FX-D1 — Applies to never guesses the level", () => {
  it("no organization selected: no level is shown and Start is unavailable", async () => {
    activeOrg = null;
    mandateHolder.mockReturnValue({
      holder: null,
      loading: false,
      error: "No organization selected",
      organizationPending: true,
    });
    await mountDialog();
    expect(trigger().textContent).not.toMatch(/Personal|Everyone|Organization/);
    expect(start().disabled).toBe(true);
  });

  it("the live read failed with an organization selected: still no guess", async () => {
    activeOrg = "org-1";
    mandateHolder.mockReturnValue({ holder: null, loading: false, error: "500", organizationPending: false });
    await mountDialog();
    expect(trigger().textContent).not.toMatch(/Personal|Everyone|Organization/);
    expect(start().disabled).toBe(true);
  });

  it("the person's own pick is honoured: Start becomes available", async () => {
    activeOrg = null;
    mandateHolder.mockReturnValue({
      holder: null,
      loading: false,
      error: "No organization selected",
      organizationPending: true,
    });
    await mountDialog();
    await pick(/Personal/);
    expect(trigger().textContent).toMatch(/Personal/);
    expect(start().disabled).toBe(false);
  });

  it("a known live level is selected for them", async () => {
    activeOrg = "org-1";
    mandateHolder.mockReturnValue({
      holder: { provenance: "org", organizationId: "org-1" },
      loading: false,
      error: null,
      organizationPending: false,
    });
    await mountDialog();
    expect(trigger().textContent).toMatch(/Organization/);
    expect(start().disabled).toBe(false);
  });
});
