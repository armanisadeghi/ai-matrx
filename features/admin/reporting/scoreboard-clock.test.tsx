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
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
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
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    ["ESLint debt", createElement(LintDebtConsole, { report: lintReport as LintDebtReport, history: [], problems: [] })],
    ["No Dead Ends", createElement(DeadEndsConsole, { report: deadEndsReport as DeadEndReport, history: [], problems: [] })],
    ["Unwired work", createElement(UnwiredConsole, { report: unwiredReport as UnwiredReport, history: [], problems: [] })],
  ])("mounts %s when the wall clock advances on every read", async (title, element) => {
    const start = Date.now();
    let reads = 0;
    jest.spyOn(Date, "now").mockImplementation(() => start + reads++);
    await act(async () => root.render(element));
    expect(container.textContent).toContain(title);
  });

  it.each([
    ["ESLint debt", createElement(LintDebtConsole, { report: { ...lintReport, generatedAt: "2026-09-18T12:00:30Z" } as LintDebtReport, history: [], problems: [] }), "This snapshot is"],
    ["No Dead Ends", createElement(DeadEndsConsole, { report: { ...deadEndsReport, generatedAt: "2026-09-18T12:00:30Z" } as DeadEndReport, history: [], problems: [] }), "Snapshot is"],
    ["Unwired work", createElement(UnwiredConsole, { report: { ...unwiredReport, generatedAt: "2026-09-17T12:00:30Z" } as UnwiredReport, history: [], problems: [] }), "Snapshot is"],
  ])("updates %s stale state when the shared clock ticks", async (_title, element, staleText) => {
    await act(async () => root.render(element));
    expect(container.textContent).not.toContain(staleText);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(container.textContent).toContain(staleText);
  });
});
