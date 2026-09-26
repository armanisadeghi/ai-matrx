/**
 * AutomationButton — BOTH STATES, on the screen.
 *
 * 🚨 Arman hit this live on 2026-08-31: the goal-writer constant named
 * `mandates.goal_writer` (plural), whose row in `mandate.definition` is
 * SOFT-DELETED (`deleted_at 2026-08-29 22:22:35Z`) and holderless, while his
 * real job is `mandate.goal_writer` (singular). The button rendered fully
 * ENABLED, he pressed it, and the app answered "this mandate does not exist".
 * The missing key was only how it got exposed; the defect is a control that
 * looks alive and is not.
 *
 * `KIND_CONVERTER_MANDATE_KEY` still points at a job nobody has created, BY
 * DESIGN — the honest-disable is what makes that legal, so it is proven here
 * rather than assumed.
 */
import type { MandateKey } from "@ai-matrx/agents/mandates";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

/**
 * The DB-authored key this button is wired to (origin='user', so no generated
 * union can carry it — the same case features/mandates/authoring/constants.ts
 * opens with dbAuthoredMandateKey()). Named once so the fixture states it, and
 * the carrier stays typed (V-L6a).
 */
const GOAL_WRITER = "mandate.goal_writer" as MandateKey;


import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { toast } from "@/lib/toast";
import {
  AutomationButton,
  notifyMissingAutomationMandate,
} from "./AutomationButton";
import { KIND_CONVERTER_MANDATE_KEY } from "./constants";
import { CHOOSE_WORKSPACE_LINE } from "./AutomationButton";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { useMandate, type MandateState } from "../useMandate";

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("../useMandate", () => ({ useMandate: jest.fn() }));
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: jest.fn(() => Promise.resolve("org-1")),
  isOrganizationSelectionCancelled: jest.fn(() => false),
}));
// The seam reads the job's SERVED inputs before it can run. These cases are
// about the KEY resolving, so the surface is held at a known-good empty
// surface; the seam's own rules are pinned in
// `features/mandates/__tests__/invoke-supplied-values.test.ts`.
jest.mock("../input-surface", () => ({
  useMandateInputSurface: jest.fn((key: string | null) =>
    key === null
      ? { status: "loading" }
      : {
          status: "ready",
          surface: {
            mandateKey: key,
            provisionKey: null,
            surfaceSource: "mandate_inputs",
            holderName: null,
            acceptsUserInput: false,
            inputs: [],
            notes: [],
          },
        },
  ),
}));

const mockedSurface = jest.requireMock("../input-surface")
  .useMandateInputSurface as jest.Mock;

const mockedUseMandate = useMandate as unknown as jest.Mock<MandateState>;

let container: HTMLDivElement;
let root: Root;

function mount(mandateKey: AnyMandateKey) {
  act(() => {
    root.render(
      <AutomationButton
        mandateKey={mandateKey}
        label="Refine with AI"
        runningLabel="Refining…"
        running={false}
        onRun={jest.fn()}
      />,
    );
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("no button rendered");
  return { button, text: container.textContent ?? "" };
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AutomationButton — the key resolves", () => {
  it("is a live, pressable control and prints no absence sentence", () => {
    mockedUseMandate.mockReturnValue({
      mandate: { agentId: "a1" } as never,
      loading: false,
      error: null,
      absent: false,
      organizationPending: false,
    });
    const { button, text } = mount(GOAL_WRITER);

    expect(button.disabled).toBe(false);
    expect(text).not.toContain("no live job has that name");
  });
});

describe("AutomationButton — the key resolves to nothing", () => {
  // 🚨 THIS COMMENT USED TO SAY "every dead state reaches the component as the
  // SAME fact: `mandate === null`" — and that blessing is exactly what became
  // V-PARITY/UX F4. `mandate === null` is a 404 AND every refusal AND an
  // unadmitted organization AND a network failure; the screen printed the one
  // reason it knew, so a LIVE `mandate.goal_writer` wore "no live job has that
  // name" and told an admin to create a job that already exists.
  //
  // The states below are the ones where the DOOR ITSELF said 404 — a missing
  // row and a soft-deleted row, both of which `_load_definition` answers with
  // nothing — so `absent` is true and this sentence is the true one. A job that
  // exists and cannot answer is a different screen, guarded in
  // `features/mandates/__tests__/automation-availability-honesty.test.tsx`.
  it.each<[string, AnyMandateKey]>([
    ["a key with no row at all", KIND_CONVERTER_MANDATE_KEY],
    [
      "the soft-deleted, holderless row Arman hit",
      // The plural key whose row is SOFT-DELETED — never in any vocabulary, and
      // that is the case under test.
      "mandates.goal_writer" as MandateKey,
    ],
  ])("%s: no control at all — never a pressable one, never a dead one", (_why, key) => {
    mockedUseMandate.mockReturnValue({
      mandate: null,
      loading: false,
      error: null,
      absent: true,
      organizationPending: false,
    });
    act(() => {
      root.render(
        <AutomationButton
          mandateKey={key}
          label="Refine with AI"
          runningLabel="Refining…"
          running={false}
          onRun={jest.fn()}
        />,
      );
    });
    // THE ORIGINAL REGRESSION: this used to be enabled, and pressing it
    // produced "this mandate does not exist" in a toast. Then it became a
    // disabled button naming the dot-notation key. A control is working or
    // absent (UX punch list 2026-09-26): nothing renders, nothing names a key.
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("says nothing about absence while it is still asking", () => {
    mockedUseMandate.mockReturnValue({
      mandate: null,
      loading: true,
      error: null,
      absent: false,
      organizationPending: false,
    });
    const { button, text } = mount(KIND_CONVERTER_MANDATE_KEY);
    // "not read yet" and "does not exist" must never look identical.
    expect(text).not.toContain("no live job has that name");
    expect(button.disabled).toBe(true);
  });

  it("keeps an intentionally absent optional mandate out of system errors", () => {
    notifyMissingAutomationMandate("mandates.kind_converter");
    expect(toast.info).toHaveBeenCalledWith(
      'Not yet — this needs the mandate "mandates.kind_converter", which does not exist. Create it and this runs.',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("the inline ask captures EVERY character, then submits it", () => {
  /**
   * 🚨 The walk typed a full sentence into the ask and the request body
   * carried only "M" — its first character. Arman would hit this the first
   * time he answers a question, so the round trip is pinned here: type, then
   * submit IMMEDIATELY, and assert the whole string reaches `onRun`.
   */
  it("types a full sentence and hands all of it to the run", () => {
    mockedUseMandate.mockReturnValue({
      mandate: { agentId: "a1" } as never,
      loading: false,
      error: null,
      absent: false,
      organizationPending: false,
    });
    mockedSurface.mockReturnValue({
      status: "ready",
      surface: {
        mandateKey: "mandate.goal_writer",
        provisionKey: null,
        surfaceSource: "mandate_inputs",
        holderName: null,
        acceptsUserInput: false,
        inputs: [
          {
            name: "brief",
            kind: "text",
            sourcing: "ask",
            variant: null,
            default: null,
            label: "Brief",
            help: "",
            placeholder: "",
            options: [],
            origin: "binding_prompt",
            nodeId: null,
          },
        ],
        notes: [],
      },
    } as never);

    const onRun = jest.fn();
    act(() => {
      root.render(
        <AutomationButton
          mandateKey={GOAL_WRITER}
          label="Refine with AI"
          runningLabel="Refining…"
          running={false}
          onRun={onRun}
        />,
      );
    });

    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("the ask did not render a textarea");
    const button = container.querySelector("button");
    if (!button) throw new Error("no button");

    // The button refuses while the question is unanswered.
    expect(button.disabled).toBe(true);

    const typed = "Make it tighter and state the done-well condition.";
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(textarea, typed);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Submit IMMEDIATELY — no blur, no debounce window.
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });

    expect(onRun).toHaveBeenCalledTimes(1);
    // THE REGRESSION: this used to be "M".
    expect(onRun.mock.calls[0][0]).toEqual({ brief: typed });
  });
});

describe("AutomationButton — no workspace chosen yet (UX punch list 2026-09-26)", () => {
  it("stays a live control that asks for a workspace, in one line with no key and no resolver prose", () => {
    mockedUseMandate.mockReturnValue({
      mandate: null,
      loading: false,
      error:
        'mandate "mandate.goal_writer" cannot resolve yet: no organization is selected.',
      absent: false,
      organizationPending: true,
    });
    const { button, text } = mount(GOAL_WRITER);

    // THE REGRESSION: this was a disabled button beside two lines of
    // developer prose naming the dot-notation key.
    expect(button.disabled).toBe(false);
    expect(text).toContain(CHOOSE_WORKSPACE_LINE);
    expect(text).not.toContain("mandate.goal_writer");
    expect(text).not.toContain("cannot resolve");

    act(() => button.click());
    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
  });
});
