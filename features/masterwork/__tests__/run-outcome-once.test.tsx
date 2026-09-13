/**
 * 🚨 ONCE PER RUN, NEVER PER RENDER (Bugbot on 163c3466).
 *
 * The triage dialog handed its finished run back from an effect keyed on the
 * callback's identity. `RulebookDetailPage` passes a fresh arrow every render
 * and the callback refreshes the workspace, which re-renders the page — so a
 * successful sort refreshed the workspace forever, and Close did not stop it
 * because the dialog stays mounted and the result was never cleared.
 *
 * This drives the real hook the three Masterwork run dialogs now share.
 */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useRunOutcome } from "../durable-run/useRunOutcome";

// React 19 refuses to treat `act` as an act scope without this.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeResult {
  dryRun: boolean;
  retired: number;
}

type Run = { runId: string | null; result: FakeResult | null };

function Harness({
  run,
  onApplied,
  when,
  renderTick,
}: {
  run: Run;
  onApplied: () => void;
  when?: (result: FakeResult) => boolean;
  renderTick: number;
}) {
  // A brand-new arrow on every render — exactly what the page passes down.
  useRunOutcome(run, () => onApplied(), { when: (r) => (when ? when(r) : true) });
  return <span>{renderTick}</span>;
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    render(props: Parameters<typeof Harness>[0]) {
      act(() => {
        root.render(<Harness {...props} />);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("handing a finished Masterwork run back to the page", () => {
  it("fires once, however often the page re-renders with a new callback", () => {
    const onApplied = jest.fn();
    const run: Run = { runId: "run-1", result: { dryRun: false, retired: 12 } };
    const view = mount();

    view.render({ run, onApplied, renderTick: 0 });
    expect(onApplied).toHaveBeenCalledTimes(1);

    // The refresh the callback triggered re-renders the page ten times over.
    for (let tick = 1; tick <= 10; tick += 1) {
      view.render({ run, onApplied, renderTick: tick });
    }
    expect(onApplied).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("fires again for the NEXT run, and never for a preview", () => {
    const onApplied = jest.fn();
    const when = (result: FakeResult) => !result.dryRun && result.retired > 0;
    const view = mount();

    // A preview changes nothing, so the page is never refreshed for it.
    view.render({
      run: { runId: "run-1", result: { dryRun: true, retired: 9 } },
      onApplied,
      when,
      renderTick: 0,
    });
    expect(onApplied).not.toHaveBeenCalled();

    // Closing the dialog resets the run; the real sort that follows is a new
    // result object and must reach the page.
    view.render({ run: { runId: null, result: null }, onApplied, when, renderTick: 1 });
    view.render({
      run: { runId: "run-2", result: { dryRun: false, retired: 9 } },
      onApplied,
      when,
      renderTick: 2,
    });
    expect(onApplied).toHaveBeenCalledTimes(1);

    view.render({
      run: { runId: "run-2", result: { dryRun: false, retired: 9 } },
      onApplied,
      when,
      renderTick: 3,
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
