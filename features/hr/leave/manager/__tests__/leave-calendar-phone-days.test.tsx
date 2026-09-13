import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  LeaveCalendarPhoneDays,
  LeaveCalendarRangeEmptyState,
} from "../LeaveCalendarSurface";
import type { LeaveCalendarEntry } from "../api/types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const linkedPartial: LeaveCalendarEntry = {
  employmentId: "employee-1",
  employeeName: "Alexandra Montgomery-Smythe",
  startsOn: "2026-09-14",
  endsOn: "2026-09-14",
  partialDay: true,
  viewerRung: "manager",
  label: "Out — Vacation",
  existenceStatement: null,
  hours: 4,
  href: "/hr/leave/requests/request-1",
  caseLinked: false,
};

const peer: LeaveCalendarEntry = {
  ...linkedPartial,
  employmentId: "employee-2",
  employeeName: "Jordan Lee",
  partialDay: false,
  label: "Out",
  hours: null,
  href: null,
};

async function render(
  node: React.ReactNode,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node as React.ReactElement);
  });
  return { container, root };
}

const rendered: Array<{ container: HTMLElement; root: Root }> = [];

afterEach(async () => {
  await act(async () => {
    for (const { container, root } of rendered.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("LeaveCalendarPhoneDays", () => {
  it("renders phone days with complete dates and every disclosed absence detail", async () => {
    const result = await render(
      <LeaveCalendarPhoneDays
        days={["2026-09-14", "2026-09-15"]}
        entriesByDay={
          new Map([
            ["2026-09-14", [linkedPartial, peer]],
            ["2026-09-15", []],
          ])
        }
        onClearSearch={() => {}}
      />,
    );
    rendered.push(result);
    const { container } = result;

    expect(container.textContent).toContain("Monday, September 14, 2026");
    expect(container.textContent).toContain("Alexandra Montgomery-Smythe");
    expect(container.textContent).toContain("Out — Vacation");
    expect(container.textContent).toContain("4 h");
    expect(container.textContent).toContain("Part of a day");
    expect(container.textContent).not.toContain("Tuesday, September 15, 2026");
    expect(
      container.querySelector('a[href="/hr/leave/requests/request-1"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="leave-calendar-phone-days"]'),
    ).not.toBeNull();
  });

  it("renders one search-miss recovery state and clears the search", async () => {
    const clearSearch = jest.fn();
    const result = await render(
      <LeaveCalendarPhoneDays
        days={["2026-09-14", "2026-09-15"]}
        entriesByDay={new Map()}
        onClearSearch={clearSearch}
      />,
    );
    rendered.push(result);
    const { container } = result;

    expect(container.textContent).toBe(
      "No absences match your search.Clear search",
    );
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Clear search");
    await act(async () => button?.click());
    expect(clearSearch).toHaveBeenCalledTimes(1);
  });

  it("renders the server's single range-empty statement with its range label", async () => {
    const result = await render(
      <LeaveCalendarRangeEmptyState
        statement="Nobody is scheduled to be out."
        rangeLabel="September 2026"
      />,
    );
    rendered.push(result);

    expect(result.container.textContent).toBe(
      "Nobody is scheduled to be out.September 2026",
    );
  });

  it("does not hide balance or HR-case columns on phones", () => {
    const source = readFileSync(
      resolve(__dirname, "../LeaveQueueSurface.tsx"),
      "utf8",
    );
    const balanceColumn = source.slice(
      source.indexOf('id: "balance"'),
      source.indexOf('id: "findings"'),
    );
    const caseColumn = source.slice(
      source.indexOf('id: "case"'),
      source.indexOf('id: "due_at"'),
    );

    expect(balanceColumn).not.toContain("mobileHidden");
    expect(caseColumn).not.toContain("mobileHidden");
  });
});
