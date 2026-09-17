/**
 * THE FRESHNESS LINE, ON SCREEN, ON ONE FROZEN CLOCK (round-4 finding V14-9).
 *
 * `describeFreshness` has always been unit-tested with an injected `now`, but
 * nothing rendered the component — and the component is where the sentence a
 * person actually reads is assembled beside the stale warning and the warning
 * icon. Because the printed age used to come from `formatRelativeTime`'s own
 * `Date.now()`, those two halves were measured against different instants and no
 * test could see it. This suite renders the real component with one clock and
 * asserts that the words, the verdict and the icon all agree with it.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const hours: { value: number | null } = { value: 72 };

jest.mock("@/features/marketing/google/freshness", () => {
  const real = jest.requireActual("@/features/marketing/google/freshness");
  return {
    ...real,
    // The knob is a live read (`platform.feature_knob`, value 72 on 2026-09-17);
    // the describer itself is the REAL one.
    useFreshnessWarningHours: () => ({
      hours: hours.value,
      unavailableReason: null,
      isLoading: false,
    }),
  };
});

// eslint-disable-next-line import/first -- after the mock above
import { DataFreshnessLine } from "./DataFreshnessLine";

const NOW = new Date("2026-09-17T18:00:00Z");

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  hours.value = 72;
});

function render(props: Partial<React.ComponentProps<typeof DataFreshnessLine>>) {
  act(() => {
    root.render(
      <DataFreshnessLine
        provider="search_console"
        dataThrough="2026-09-14"
        pulledAt="2026-09-17T17:20:00Z"
        now={NOW}
        {...props}
      />,
    );
  });
  return container.textContent ?? "";
}

describe("the freshness line on one frozen clock", () => {
  it("prints Arman's sentence, to the minute, and calls nothing stale", () => {
    const text = render({});
    expect(text).toContain(
      "data through Sep 14 · pulled 40 minutes ago · Google runs about three days behind",
    );
    expect(text).not.toContain("older than the 72 hours");
  });

  it("the printed age and the stale warning are measured against the SAME instant", () => {
    // 73 hours before NOW: past the knob, and the words say three days.
    const text = render({ pulledAt: "2026-09-14T17:00:00Z" });
    expect(text).toContain("pulled 3 days ago");
    expect(text).toContain(
      "This is older than the 72 hours your organization allows",
    );
    // 71 hours before NOW: inside the knob, and the words moved with the verdict.
    const fresh = render({ pulledAt: "2026-09-14T19:00:00Z" });
    expect(fresh).toContain("pulled 2 days ago");
    expect(fresh).not.toContain("older than the 72 hours");
  });

  it("GA4 gets its own lag sentence and the property timezone rides along", () => {
    const text = render({ provider: "analytics", timezone: "America/Los_Angeles" });
    expect(text).toContain("Google runs about a day behind");
    expect(text).toContain("times in America/Los_Angeles");
  });

  it("an unreadable knob is printed, not swallowed — and nothing is called stale", () => {
    hours.value = null;
    const text = render({ pulledAt: "2026-08-01T00:00:00Z" });
    expect(text).toContain("could not be read");
    expect(text).toContain("nothing is being called stale");
    expect(text).not.toContain("older than the");
  });

  it("a pull time ahead of the clock is a clock problem, never an age", () => {
    const text = render({ pulledAt: "2026-09-19T18:00:00Z" });
    expect(text).toContain("ahead of your clock");
    expect(text).not.toContain("pulled in ");
  });
});
