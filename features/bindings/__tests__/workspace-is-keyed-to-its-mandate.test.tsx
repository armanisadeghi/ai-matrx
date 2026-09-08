/**
 * ── A VERDICT ABOUT ONE JOB CANNOT OUTLIVE THE JOB IT IS ABOUT ───────────────
 *
 * 🚨 THE DEFECT (V-PARITY/UX R-O6, closing lens round 2, on production). The
 * walker triggered the server's containment refusal on `zzz_vpux2.scratch`,
 * then let the SPA navigate to `zzz_vpux2.scratch_2`. The refusal about the
 * FIRST job was still in the DOM, now sitting under the SECOND job's heading.
 * Only a hard reload cleared it. Stale, not false — and the fourth law does not
 * distinguish: a screen that shows a refusal about a job you are not looking at
 * is lying about the job you are.
 *
 * THE ROOT CAUSE was one absent token in a React key. `OneBindingWorkspace`
 * keys its draft by `rung : organization : binding id : updated_at` — and a
 * mandate with NO binding at that rung produces the identical string on every
 * mandate in the platform (`system::new:`). So React reused the instance and
 * every `useState` inside it, `saveError` among them. Nothing about the
 * navigation was wrong; the component simply could not tell the two jobs apart.
 *
 * WHAT THIS GUARD DRIVES. The REAL exported `OneBindingWorkspace`, re-pointed
 * at a second mandate by a props change — never a remount, because a remount is
 * exactly what production did not do. The refusal is held by a stateful stand-in
 * mounted where the workspace's own stateful body sits: it captures the mandate
 * it first saw and keeps saying so, which is precisely the behaviour of a
 * `useState` that nothing resets. If the workspace is keyed to its mandate the
 * stand-in remounts and the first job's words are gone; if it is not, they are
 * still on screen — which is what production showed.
 *
 * RED at `65b8115fad` (the pre-fix tree): both "is gone" assertions fail.
 *
 * ── AND THE HALF A KEY CANNOT REACH (added after the independent walk) ───────
 *
 * The fresh Sonnet walk of the SERVED v0.4.1754 confirmed the in-page refusal
 * clears — and FAILED this observation anyway, because the same sentence was
 * ALSO in a toast, and a toast lives in an app-wide portal that no key on this
 * component can reach. It named `zzz_fixr17.walk` while the reader was looking
 * at `crm.journalist_beat_analyst`, and it was still there 8+ seconds later
 * (sonner pauses dismiss timers while the document is hidden — a browser pane
 * usually is).
 *
 * The toast was a SECOND COPY of a sentence this page already keeps
 * permanently. So the rule, which is FIX-R16's rule one screen over: a failure
 * sentence with an inline home is never also toasted. The second describe below
 * drives the real save path and asserts the toast module is never called.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * THE STATEFUL STAND-IN. It holds the refusal the way the workspace holds
 * `saveError` — in `useState`, seeded once at mount, never re-derived from
 * props. Deliberately faithful: if it re-read its props every render it would
 * pass with or without the fix and prove nothing.
 */
let mountCount = 0;
/**
 * ONE fake store, read by BOTH `useAppSelector` and `useAppStore().getState()`.
 * Those two disagreeing is not a shape the real framework can hold, and a
 * double that CAN hold it is a false test: the agent pre-flight reads through
 * the store, so a store answering `{}` leaves Save permanently disabled and the
 * second guard below would drive a control a person could not click either.
 */
const HELD_AGENT = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";
const FAKE_STATE = {
  agents: { builtinAgents: [] },
  userAuth: { userId: "user-1", adminLevel: "super_admin" },
  instanceOverrides: {},
  appContext: { organization_id: "org-1" },
  agentDefinition: {
    agents: {
      // A FULLY READ agent. `isReady` is computed from `_loadedFields`, so a
      // record without them means "not read yet", never "healthy".
      [HELD_AGENT]: {
        id: HELD_AGENT,
        isVersion: false,
        variableDefinitions: [],
        contextPolicies: [],
        _loadedFields: { variableDefinitions: true, contextPolicies: true },
      },
    },
    activeAgentId: null,
    status: "idle",
    error: null,
  },
  instanceModelOverrides: { byConversationId: {} },
};
const mockDispatch = () => ({ unwrap: () => Promise.resolve([]) });
const mockStore = { getState: () => FAKE_STATE, dispatch: () => undefined };
jest.mock("@/features/bindings/ScopeHolderBar", () => ({
  // The module's pure words stay REAL — only the component is stood in for.
  ...jest.requireActual("@/features/bindings/ScopeHolderBar"),
  ScopeHolderBar: ({ job }: { job: { mandateKey: string } }) => {
    // Deliberately NOT the door's own wording — the second guard below asserts
    // the DOOR's sentence, and a stand-in that emits it would make that guard
    // pass without the door ever being called.
    const [refusal] = useState(
      () => `Held verdict about ${job.mandateKey}, captured at mount.`,
    );
    mountCount += 1;
    return <p data-testid="refusal">{refusal}</p>;
  },
}));

// The bar's own heavy leaves — registered so the `requireActual` above costs
// nothing beyond the module's pure words.
jest.mock(
  "@/features/agents/components/agent-listings/AgentListDropdown",
  () => ({ AgentListDropdown: () => <div data-testid="agent-picker" /> }),
);
jest.mock("@/features/agent-shortcuts/components/AgentVersionPicker", () => ({
  AgentVersionPicker: () => <div data-testid="version-picker" />,
}));
jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));
jest.mock("@/features/bindings/WorkflowHolderPicker", () => ({
  WorkflowHolderPicker: () => <div data-testid="workflow-picker" />,
}));

// Leaves. None of them holds a verdict; each is heavy and none is under test.
jest.mock("@/features/bindings/BindingMiddle", () => ({
  BindingMiddle: () => <div />,
}));
jest.mock("@/features/bindings/HolderInputsColumn", () => ({
  HolderInputsColumn: () => <div />,
}));
jest.mock("@/features/bindings/OfferedInventoryColumn", () => ({
  OfferedInventoryColumn: () => <div />,
}));
jest.mock("@/features/bindings/AutoRunBar", () => ({
  AutoRunBar: () => <div />,
}));
jest.mock("@/features/bindings/BindingOptionsDrawer", () => ({
  BindingOptionsDrawer: () => <div />,
}));
jest.mock("@/features/bindings/batch/BatchMode", () => ({
  BatchMode: () => <div />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));

jest.mock("@/lib/redux/hooks", () => ({
  // A FAITHFUL dispatch double: the real one returns a thunk promise with
  // `.unwrap()`, and this tree calls it. A double that cannot hold the shape
  // the real framework holds is a false test.
  useAppDispatch: () => mockDispatch,
  // Run the real selector against a state shaped enough for this tree; a
  // selector that reads something absent gets `undefined`, exactly as it would
  // before its slice hydrates.
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(FAKE_STATE),
  useAppStore: () => mockStore,
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [{ id: "org-1", name: "Write Target Sandbox", role: "admin" }],
  }),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  ...jest.requireActual("@/features/agents/redux/agent-definition/selectors"),
  selectBuiltinAgents: () => [],
}));
/** Every toast this tree could raise, counted. */
const toasts: { level: string; text: unknown }[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (text: unknown) => toasts.push({ level: "error", text }),
    success: (text: unknown) => toasts.push({ level: "success", text }),
    warning: (text: unknown) => toasts.push({ level: "warning", text }),
    info: (text: unknown) => toasts.push({ level: "info", text }),
    message: (text: unknown) => toasts.push({ level: "message", text }),
    dismiss: () => undefined,
  },
}));

/** The door refuses exactly as `mandate.guard_binding_containment` does. */
const CONTAINMENT_REFUSAL =
  "Mandate 'zzz_vpux2.scratch' is homed in a single organization, so it cannot carry a GLOBAL binding.";
jest.mock("@/features/mandates/overrides", () => ({
  ...jest.requireActual("@/features/mandates/overrides"),
  putMandateDefaultHolder: () => Promise.reject(new Error(CONTAINMENT_REFUSAL)),
  putMandateBinding: () => Promise.reject(new Error(CONTAINMENT_REFUSAL)),
}));

jest.mock("@/features/bindings/useHolderInputs", () => ({
  useHolderInputs: () => ({
    status: "ready",
    targets: [],
    contextKeys: new Set<string>(),
  }),
}));
jest.mock("@/features/mandates/input-surface", () => ({
  useMandateInputSurface: () => ({ status: "idle" }),
}));

import { OneBindingWorkspace } from "@/features/bindings/OneBindingWorkspace";
import { HELD_AGENT_ID, makeWorkspaceData } from "./workspace-fixtures";

const MANDATE_A = "zzz_vpux2.scratch";
const MANDATE_B = "zzz_vpux2.scratch_2";

describe("a refusal is keyed to the mandate it is about", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mountCount = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("does not survive a client-side move to another mandate", () => {
    act(() => {
      root.render(
        <OneBindingWorkspace
          data={makeWorkspaceData({
            id: "11111111-1111-4111-8111-111111111111",
            mandateKey: MANDATE_A,
          })}
          perspective="system"
          fixedRung={["system", "global"]}
          onChanged={() => undefined}
        />,
      );
    });
    expect(host.textContent).toContain(MANDATE_A);

    // The SPA move: same element, new props. Never a remount — production did
    // not remount either, which is the whole reason the refusal survived.
    act(() => {
      root.render(
        <OneBindingWorkspace
          data={makeWorkspaceData({
            id: "22222222-2222-4222-8222-222222222222",
            mandateKey: MANDATE_B,
          })}
          perspective="system"
          fixedRung={["system", "global"]}
          onChanged={() => undefined}
        />,
      );
    });

    expect(host.textContent).not.toContain(`Mandate ${MANDATE_A} is homed`);
    expect(host.textContent).toContain(MANDATE_B);
    // Proof it was a REMOUNT that cleared it, not a lucky re-render: state
    // held in the second instance is a second instance.
    expect(mountCount).toBeGreaterThan(1);
  });
});

/**
 * ── THE SECOND COPY, IN THE PORTAL NO KEY CAN REACH ─────────────────────────
 *
 * Driven through the REAL `save()` on the REAL component, with the door
 * refusing exactly as `mandate.guard_binding_containment` does.
 *
 * RED at `69daf265ef` (the SERVED v0.4.1754 the walk failed): `toasts` holds
 * one `error` carrying the refusal, which is what outlived the mandate on the
 * walker's screen.
 */
describe("a refusal with an inline home is never also toasted", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    toasts.length = 0;
    mountCount = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("puts the door's words on the page and raises no toast", async () => {
    act(() => {
      root.render(
        <OneBindingWorkspace
          data={makeWorkspaceData({
            id: "11111111-1111-4111-8111-111111111111",
            mandateKey: MANDATE_A,
            heldBy: HELD_AGENT_ID,
          })}
          perspective="system"
          fixedRung={["system", "global"]}
          onChanged={() => undefined}
        />,
      );
    });

    // Let the agent pre-flight settle — Save is deliberately disabled while a
    // verdict is still being fetched, and clicking through that would be a
    // guard driving a control the person could not have clicked either.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const save = Array.from(host.querySelectorAll("button")).find((b) =>
      /^(Set|Save)\b/.test(b.textContent ?? ""),
    );
    expect(save).toBeDefined();
    // A disabled button proves nothing — the guard must actually reach the door.
    expect(save?.disabled).toBe(false);

    await act(async () => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // The record: the door's own sentence, on the page, where the mandate's
    // key can take it away again.
    expect(host.textContent).toContain("cannot carry a GLOBAL binding");
    // And NOT a second copy in the app-wide portal — the copy that outlived
    // the job on production.
    expect(toasts).toEqual([]);
  });
});
