/**
 * THE EMPTY STATE CANNOT LIE.
 *
 * A prediction ledger spends its first weeks with every call open and no
 * outcomes recorded. A calibration chart drawn over zero outcomes reads as
 * "you are calibrated at nothing"; a score of 0 reads as PERFECT, since 0 is
 * literally the best Brier score there is. Either one is a screen telling an
 * Expert something false about her own judgment.
 *
 * ## The breaks this catches
 *
 * 1. `CalibrationReadout` rendering the chart branch when nothing is resolved
 *    (delete the `counts.resolved === 0` guard and this fails).
 * 2. The waiting state losing the two facts that make it actionable — how many
 *    calls are open, and when the first answer is due.
 * 3. The scored branch never rendering at all — the second forcing input, with
 *    a DIFFERENT expected state, so a component stubbed to always return the
 *    waiting state cannot pass this file.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CalibrationReadout } from "../CalibrationReadout";
import type { PredictionEntry } from "../scoring";

function entry(
  id: string,
  confidence: number,
  outcome: boolean | null,
  due_at: string,
): PredictionEntry {
  return {
    id,
    case_label: `Case ${id}`,
    prediction: "Something happens",
    confidence,
    why: "A reason",
    due_at,
    captured_by: "typed",
    created_at: "2026-09-01T00:00:00Z",
    created_by: "u1",
    outcome,
    outcome_note: "",
    resolved_at: outcome === null ? null : "2026-10-02T00:00:00Z",
    distilled_run_id: null,
  };
}

// React 19 wants this declared before any act() call in a plain jsdom test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

describe("with predictions recorded but NO outcomes", () => {
  const openOnly = [
    entry("a", 0.8, null, "2026-10-01"),
    entry("b", 0.6, null, "2026-11-15"),
    entry("c", 0.9, null, "2026-12-20"),
  ];

  it("renders the waiting state and NOT a chart or a score", () => {
    render(<CalibrationReadout entries={openOnly} today="2026-09-15" />);
    const section = container.querySelector(
      '[data-surface-value="prediction_calibration"]',
    );
    expect(section).not.toBeNull();
    expect(section!.getAttribute("data-state")).toBe("waiting-on-outcomes");

    // No chart of any kind — not an empty one, not a zeroed one.
    expect(container.querySelector("[data-chart]")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();

    // And no claim about accuracy. "0" here would read as a perfect score.
    const text = container.textContent ?? "";
    expect(text).toContain("none of your calls have an outcome recorded");
    expect(text).not.toContain("called right");
    expect(text).not.toMatch(/land (very )?close to what happens/);
  });

  it("names how many are waiting and when the first answer is due", () => {
    render(<CalibrationReadout entries={openOnly} today="2026-09-15" />);
    const text = container.textContent ?? "";
    expect(text).toContain("3 calls waiting");
    // The earliest OPEN due date — the 1st of October, not the 15th of
    // November and not the resolved-entry dates. Matched loosely because the
    // month/day order is the READER's locale, which is not this guard's
    // business; what is its business is that the date shown is that one.
    expect(text).toMatch(/October\s*1,?\s*2026|1\s*October\s*2026/);
    expect(text).not.toContain("November");
  });

  it("renders nothing at all when there is no ledger yet", () => {
    render(<CalibrationReadout entries={[]} today="2026-09-15" />);
    expect(
      container.querySelector('[data-surface-value="prediction_calibration"]'),
    ).toBeNull();
  });
});

describe("once ONE outcome is recorded", () => {
  it("leaves the waiting state for the scored state", () => {
    // The second forcing input: same component, different expected state. A
    // component hardwired to the waiting state passes the block above and
    // fails here.
    const mixed = [
      entry("a", 0.8, true, "2026-10-01"),
      entry("b", 0.6, null, "2026-11-15"),
    ];
    render(<CalibrationReadout entries={mixed} today="2026-10-05" />);
    const section = container.querySelector(
      '[data-surface-value="prediction_calibration"]',
    );
    expect(section!.getAttribute("data-state")).toBe("scored");
    const text = container.textContent ?? "";
    expect(text).toContain("1 of 1 called right");
    expect(text).toContain("1 still waiting");
    expect(text).not.toContain("none of your calls have an outcome recorded");
  });
});
