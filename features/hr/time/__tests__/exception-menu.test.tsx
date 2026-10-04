import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@ai-matrx/design-system";
import type { AttendanceExceptionRow } from "../api/types";
import { ExceptionResolveMenu } from "../shared/ExceptionResolveMenu";

const observedControls = jest.fn();
jest.mock("../shared/ExceptionsStrip", () => ({
  ExceptionResolveControls: (props: {
    exception: { id: string };
    onResolved: () => void;
  }) => {
    observedControls(props);
    return <button onClick={props.onResolved}>Successful resolution</button>;
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("exception action menu host contract", () => {
  let root: Root;
  let host: HTMLDivElement;
  const exception: AttendanceExceptionRow = {
    id: "real-row-id",
    employmentId: "employment-id",
    employeeDisplayName: "Example employee",
    exceptionKind: "orphan_punch",
    severity: "warn",
    resolutionState: "open",
    detectedAt: "2026-10-04T00:00:00Z",
    localWorkDate: "2026-10-03",
    tz: "UTC",
    varianceMinutes: null,
    scheduledStartAt: null,
    scheduledEndAt: null,
    actualStartAt: null,
    actualEndAt: null,
    punchId: null,
    shiftId: null,
    workIntervalId: null,
    scheduleChangeId: null,
    correctiveActionId: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByName: null,
    premiumEarningCodeId: null,
    allowedResolutions: ["acknowledged"],
    message: "Estimated interval",
    isEstimate: true,
    workedAfterDenial: false,
  };
  beforeEach(() => {
    observedControls.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the row icon-only and passes the identical record to the existing controls", () => {
    const onResolved = jest.fn();
    act(() =>
      root.render(
        <TooltipProvider>
          <ExceptionResolveMenu
            exception={exception}
            readOnly={false}
            onResolved={onResolved}
          />
        </TooltipProvider>,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Decide exception"]',
    );
    if (!trigger) throw new Error("Missing decision trigger");
    expect(trigger.textContent).toBe("");
    expect(observedControls).not.toHaveBeenCalled();
    act(() => trigger.click());
    expect(observedControls.mock.calls.at(-1)?.[0].exception).toBe(exception);
    const success = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Successful resolution",
    );
    if (!success) throw new Error("Missing domain action");
    act(() => success.click());
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[aria-label="Exception decisions"]'),
    ).toBeNull();
  });

  it("explains read-only decisions without mounting any mutation controls", () => {
    const onResolved = jest.fn();
    act(() =>
      root.render(
        <TooltipProvider>
          <ExceptionResolveMenu
            exception={exception}
            readOnly
            onResolved={onResolved}
          />
        </TooltipProvider>,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="About exception decisions"]',
    );
    if (!trigger) throw new Error("Missing read-only decision trigger");
    act(() => trigger.click());
    expect(document.body.textContent).toContain("Your manager decides this.");
    expect(observedControls).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
