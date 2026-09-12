/**
 * A REMOUNT WHILE OPEN KEEPS WHAT THE EXPERT TYPED (Bugbot on e1b62ed0).
 *
 * `RuleEditorForm` is REMOUNTED, not reopened, every time `draftRevision`
 * bumps and whenever the page mounts it already open. `wasOpen` was seeded
 * with `open`, so the closed-to-open restore never ran on such a mount: the
 * persisted draft was ignored at first render AND at restore, the live rule's
 * "When:" / "Next:" took the screen, and the persist effect then wrote those
 * live values over the Expert's saved draft — losing exactly what the previous
 * fix was meant to keep.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — initialising policy from `initial` instead of the persisted
 *    draft (or seeding `wasOpen` with `open` again);
 *  · second — the persist effect overwriting the stored policy with the live
 *    rule's values on that same mount.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { makeStore } from "@/lib/redux/store";
import { patchWizardDraft } from "@/lib/redux/slices/wizardDraftSlice";
import { RuleEditorDialog } from "./RuleEditorDialog";
import type { RulebookRule } from "../../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships neither of these; layout machinery, not the behaviour under test.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

jest.mock("@/features/agents/components/live-run/LiveRunDisplay", () => ({
  LiveRunDisplay: () => null,
}));

jest.mock("../../review/useRuleImproveRun", () => ({
  useRuleImproveRun: () => ({
    run: jest.fn(),
    running: false,
    requestId: null,
    stages: [],
  }),
}));

const RULEBOOK_ID = "rb-1";
const VERSION = 8;
const RULE: RulebookRule = {
  id: "R1",
  name: "Escalate a stiff neck with fever",
  statement: "Fever plus a stiff neck goes to imaging within the hour.",
  rationale: "Meningitis moves faster than the ward does.",
  detection: "Look for the pair together in the notes.",
  quote: "the worst headache of her life",
  severity: "critical",
  section: "G",
  precondition: { summary: "The LIVE rule's precondition", known: [], unknown: [] },
  next_action: { kind: "test", target: "The LIVE rule's next action" },
} as RulebookRule;

/** What the Expert typed and has NOT saved, as the wizard draft holds it. */
const DRAFT_POLICY = {
  preconditionSummary: "What she actually typed",
  preconditionKnown: "temp 39.1",
  preconditionUnknown: "CSF result",
  nextActionKind: "test",
  nextActionTarget: "Lumbar puncture, now",
  nextActionBuys: "Rules meningitis in or out",
  nextActionCost: "3",
  nextActionRisk: "2",
  nextActionUrgency: "now",
};

const wizardId = `masterwork-rule-editor:${RULEBOOK_ID}:${RULE.id}`;

/**
 * Seeded through the REAL write path the editor itself uses — a hand-built
 * state tree would prove the test's idea of the draft, not the app's.
 */
function storeWithDraft() {
  const store = makeStore();
  store.dispatch(
    patchWizardDraft({
      wizardId,
      patch: {
        baseVersion: VERSION,
        fields: {
          mode: "edit",
          rule_id: RULE.id,
          name: RULE.name,
          statement: "The half-finished statement she was typing.",
          rationale: RULE.rationale,
          detection: RULE.detection,
          quote: RULE.quote,
          severity: RULE.severity,
          section: RULE.section,
        },
        beforeTidy: null,
        policy: DRAFT_POLICY,
      },
    }),
  );
  return store;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountOpen(store: ReturnType<typeof makeStore>) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <RuleEditorDialog
          open
          onOpenChange={() => undefined}
          sections={{ G: { label: "General" } }}
          existingIds={new Set([RULE.id])}
          initial={RULE}
          onSave={async () => undefined}
          surfaceName="masterwork-rulebook"
          getSurfaceScope={() => ({}) as never}
          rulebookId={RULEBOOK_ID}
          rulebookVersion={VERSION}
          organizationId="org-1"
          draftRevision={2}
          onDraftChange={() => undefined}
        />
      </Provider>,
    );
  });
}

function values() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  ).map((el) => el.value);
}

it("shows the persisted When: / Next: on a mount that starts open", async () => {
  const store = storeWithDraft();
  await mountOpen(store);

  const shown = values();
  expect(shown).toContain("What she actually typed");
  expect(shown).toContain("Lumbar puncture, now");
  // The live rule's own policy is NOT what she is looking at.
  expect(shown).not.toContain("The LIVE rule's precondition");
  expect(shown).not.toContain("The LIVE rule's next action");
  // The prose half survives the same remount.
  expect(shown).toContain("The half-finished statement she was typing.");
});

it("does not overwrite the stored draft with the live rule's policy", async () => {
  const store = storeWithDraft();
  await mountOpen(store);

  const stored = store.getState().wizardDraft.drafts[wizardId]?.data as {
    policy?: Record<string, string>;
  };
  expect(stored.policy?.preconditionSummary).toBe("What she actually typed");
  expect(stored.policy?.nextActionTarget).toBe("Lumbar puncture, now");
});
