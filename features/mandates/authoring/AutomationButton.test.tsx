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

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { toast } from "@/lib/toast";
import {
  AutomationButton,
  missingAutomationMandateLine,
  notifyMissingAutomationMandate,
} from "./AutomationButton";
import { KIND_CONVERTER_MANDATE_KEY } from "./constants";
import { useMandate, type MandateState } from "../useMandate";

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("../useMandate", () => ({ useMandate: jest.fn() }));
// The seam reads the job's SERVED inputs before it can run. These cases are
// about the KEY resolving, so the surface is held at a known-good empty
// surface; the seam's own rules are pinned in
// `features/mandates/__tests__/invoke-supplied-values.test.ts`.
jest.mock("../input-surface", () => ({
  useMandateInputSurface: (key: string | null) =>
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
}));

const mockedUseMandate = useMandate as unknown as jest.Mock<MandateState>;

let container: HTMLDivElement;
let root: Root;

function mount(mandateKey: string) {
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
    });
    const { button, text } = mount("mandate.goal_writer");

    expect(button.disabled).toBe(false);
    expect(text).not.toContain("no live job has that name");
  });
});

describe("AutomationButton — the key resolves to nothing", () => {
  // Every dead state reaches the component as the SAME fact: `mandate === null`
  // from `useMandate({ optional: true })`. `resolveMandate` produces it for a
  // missing row, a soft-deleted row (it filters `deleted_at`), a disabled row,
  // and a holderless or version-pinned one.
  it.each([
    ["a key with no row at all", KIND_CONVERTER_MANDATE_KEY],
    ["the soft-deleted, holderless row Arman hit", "mandates.goal_writer"],
  ])("%s: the button is DISABLED, with the reason on screen", (_why, key) => {
    mockedUseMandate.mockReturnValue({
      mandate: null,
      loading: false,
      error: null,
    });
    const { button, text } = mount(key);

    // THE REGRESSION: this used to be enabled, and pressing it produced
    // "this mandate does not exist" in a toast.
    expect(button.disabled).toBe(true);
    // And the reason is WORDS ON THE SCREEN, naming the exact key — not a
    // tooltip, which nobody sees until they hover a control that looks fine.
    expect(text).toContain(missingAutomationMandateLine(key));
    expect(text).toContain(key);
  });

  it("says nothing about absence while it is still asking", () => {
    mockedUseMandate.mockReturnValue({
      mandate: null,
      loading: true,
      error: null,
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
