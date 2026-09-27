/**
 * THE TEST TAB NAMES WHAT'S MISSING, NOT "CHECK YOUR CONNECTION".
 *
 * 🚨 THE DEFECT: a required input left blank never even reaches
 * `POST /mandates/{key}/try` — `buildTryVariables` throws before the fetch —
 * yet the panel routed that client-side validation problem through
 * `describeMandateRunFailure` → `RunFailureCard`, the SAME path a dead socket
 * takes. `mandateRefusalHeadline` answers a `status: null` failure with "The
 * run never reached the server", and the card adds "check your connection" —
 * both false for a run that was never attempted because a field was empty.
 *
 * The fix: `buildTryVariables` throws a `MandateInputProblem` carrying the
 * field's name, `run()` catches it BEFORE it can reach the network-failure
 * card, names the exact input inline next to the field, and moves focus
 * there.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => null,
  useAppStore: () => ({ getState: () => ({}), dispatch: jest.fn() }),
}));

const READY_SURFACE = {
  status: "ready" as const,
  surface: {
    mandateKey: "test.mandate",
    provisionKey: null,
    surfaceSource: "mandate_inputs" as const,
    holderName: null,
    acceptsUserInput: false,
    notes: [],
    inputs: [
      {
        name: "topic",
        kind: "text",
        sourcing: "require" as const,
        variant: null,
        default: null,
        label: "Topic",
        help: "",
        placeholder: "",
        options: [],
        origin: "mandate_input" as const,
        nodeId: null,
        example: "",
        jsonSchema: {},
        required: true,
        pinned: false,
        readOnly: false,
      },
    ],
  },
};

jest.mock("@/features/mandates/input-surface", () => ({
  useMandateInputSurface: () => READY_SURFACE,
}));

jest.mock("../owner-service", () => ({
  runMandateTry: jest.fn(),
}));

// eslint-disable-next-line import/first
import { MandateTryPanel } from "../MandateTryPanel";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe("MandateTryPanel — a missing required input names itself", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mount());
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("never claims the run couldn't reach the server", async () => {
    act(() => {
      root.render(
        <TooltipProvider>
          <MandateTryPanel
            mandateKey="test.mandate"
            outputKind={null}
            organizationId="org-1"
          />
        </TooltipProvider>,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Run it"),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const text = container.textContent ?? "";
    // THE OLD LIE — must never appear for a run that was never attempted.
    expect(text).not.toContain("The run never reached the server");
    expect(text).not.toContain("check your connection");
    // THE REAL CAUSE, named in plain words, next to the field.
    expect(text).toContain("Topic is required.");

    // Focus landed ON the missing field, not left on the button.
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
  });
});
