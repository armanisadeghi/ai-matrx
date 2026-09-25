/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LintDebtConsole } from "@/features/admin/lint-debt/LintDebtConsole";
import { DeadEndsConsole } from "@/features/admin/dead-ends/DeadEndsConsole";
import { UnwiredConsole } from "@/features/admin/unwired/UnwiredConsole";
import type { LintDebtReport } from "@/scripts/lint-debt/types";
import type { DeadEndReport } from "@/scripts/dead-ends/types";
import type { UnwiredReport } from "@/scripts/unwired/types";
import lintReport from "@/scripts/lint-debt/report.json";
import deadEndsReport from "@/scripts/dead-ends/report.json";
import unwiredReport from "@/scripts/unwired/report.json";

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: () => null,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("report scoreboard clocks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-25T12:00:00Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it.each([
    ["ESLint debt", createElement(LintDebtConsole, { report: lintReport as LintDebtReport, history: [], problems: [] })],
    ["No Dead Ends", createElement(DeadEndsConsole, { report: deadEndsReport as DeadEndReport, history: [], problems: [] })],
    ["Unwired Work", createElement(UnwiredConsole, { report: unwiredReport as UnwiredReport, history: [], problems: [] })],
  ])("mounts %s and ticks without a render loop", async (title, element) => {
    await act(async () => root.render(element));
    expect(container.textContent).toContain(title);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(container.textContent).toContain(title);
  });
});
