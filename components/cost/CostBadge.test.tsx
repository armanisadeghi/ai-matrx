/**
 * An unmeasured cost is never called free (cold walk 23, F). The badge used to
 * compute its tier from `toPoints(usd) ?? 0`, so a real $0.37 run read "No AI
 * cost — deterministic or read-only." whenever the points rate had not
 * answered yet, and an unpriced run read the same.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { CostBadge } from "./CostBadge";

let rate: number | null = null;
jest.mock("./pointsRate.client", () => ({ usePointsRate: () => rate }));
jest.mock("next/navigation", () => ({ usePathname: () => "/masterwork" }));

function titleOf(html: string): string {
  return /title="([^"]*)"/.exec(html)?.[1] ?? "";
}

it("does not call a priced run free while the rate is unanswered", () => {
  rate = null;
  expect(titleOf(renderToString(<CostBadge usd={0.369} />))).not.toContain("No AI cost");
});

it("says an unpriced run is not priced yet", () => {
  rate = 20000;
  expect(titleOf(renderToString(<CostBadge usd={null} />))).toBe("Not priced yet.");
});

it("still names the tier once the rate answers", () => {
  rate = 20000;
  const html = renderToString(<CostBadge usd={0.369} />);
  expect(html).toContain("7,380 points");
  expect(titleOf(html)).toContain("An estimate of the AI work this step uses.");
});
