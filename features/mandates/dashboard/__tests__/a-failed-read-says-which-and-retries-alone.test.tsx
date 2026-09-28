/**
 * A FAILED DASHBOARD READ SAYS WHICH READ, WHY, AND OFFERS ITS OWN RETRY.
 *
 * Defect (2026-09-28): /administration/intelligence/mandates/dashboard showed
 * KPI sections reading, in full, "Not measured: Failed to fetch". Those are the
 * BROWSER's words for "no answer arrived" (captured on 2026-09-26 10:58 UTC:
 * GET /mandates/coverage, GET /mandates/code-truth and POST
 * /mandates/impact/workflows all rejected with `TypeError: Failed to fetch`
 * within 0.4 s, while the server logged no request and no 5xx — the answer
 * never reached the page). The section named neither the read nor a remedy,
 * and the only way back was the page-wide Refresh.
 *
 * This drives the real <MandateDashboard/> with the five reads stubbed at their
 * module seam: the coverage read rejects exactly the way `fetchMandateCoverage`
 * does on a transport failure (`new Error(response.error.message)`), then
 * succeeds. The section must (1) never print the raw browser string, (2) name
 * the read that failed, (3) offer a Retry that re-runs ONLY that read, and
 * (4) show the real number once the retry lands.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.setTimeout(60_000);

const calls: Record<string, number> = {
  console: 0,
  coverage: 0,
  truth: 0,
  board: 0,
  workflow: 0,
};

const consoleData = { mandates: [], bindingsByMandateId: {} };
/** Set by a test: the next console (database) read fails with THIS. */
let consoleFailure: unknown = null;
const coverageReport = {
  computed_at: new Date().toISOString(),
  counts: { green: 0, orange: 0, red: 0 },
  orange: [],
  red: [],
};

// One dispatch for the whole run, exactly as the real store hands out.
const stableDispatch = () => Promise.resolve({ data: null, error: null });
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => stableDispatch,
  useAppSelector: () => null,
}));

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

jest.mock("@/features/mandates/admin/service", () => ({
  fetchMandateConsoleData: () => {
    calls.console += 1;
    if (consoleFailure) {
      const failure = consoleFailure;
      consoleFailure = null;
      return Promise.reject(failure);
    }
    return Promise.resolve(consoleData);
  },
  fetchMandateCodeTruthReport: () => {
    calls.truth += 1;
    return Promise.resolve({ mandates: [] });
  },
}));

jest.mock("@/features/mandates/coverage", () => {
  const actual = jest.requireActual("@/features/mandates/coverage");
  return {
    ...actual,
    fetchMandateCoverage: () => {
      calls.coverage += 1;
      // The first call fails the way a dropped connection reaches this module.
      return calls.coverage === 1
        ? Promise.reject(new Error("Failed to fetch"))
        : Promise.resolve(coverageReport);
    },
  };
});

jest.mock("@/features/mandates/admin/references", () => ({
  fetchMandateReferenceBoard: () => {
    calls.board += 1;
    return Promise.resolve({
      repos: [],
      unverified_repos: [],
      open_finding_count: 0,
      conversion_count: 0,
      bypass_count: 0,
      patrol: null,
    });
  },
}));

jest.mock("@/features/mandates/admin/workflow-impact", () => ({
  fetchWorkflowImpact: () => {
    calls.workflow += 1;
    return Promise.resolve({
      verdicts: [],
      workflows_examined: 0,
      withheld: { total: 0, sentence: null },
    });
  },
}));

import { MandateDashboard } from "../MandateDashboard";
import { MandateDoorError } from "@/features/mandates/door-error";

let root: Root;
let container: HTMLDivElement;

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function sectionOf(title: string): HTMLElement {
  const heading = [...container.querySelectorAll("h2")].find(
    (h) => h.textContent === title,
  );
  if (!heading) throw new Error(`no section titled ${title}`);
  return heading.closest("section") as HTMLElement;
}

beforeEach(async () => {
  for (const key of Object.keys(calls)) calls[key] = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MandateDashboard />);
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a failed dashboard read", () => {
  it("names the read, never prints the browser's raw words, and retries alone", async () => {
    const coverage = sectionOf("Binding coverage");
    const alert = coverage.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    const text = alert?.textContent ?? "";
    expect(text).not.toMatch(/Failed to fetch/);
    expect(text).toMatch(/binding coverage/i);
    expect(text).toMatch(/\/mandates\/coverage/);
    expect(text).toMatch(/try again/i);

    // Every other section measured.
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);

    const retry = [...coverage.querySelectorAll("button")].find((b) =>
      /retry/i.test(b.textContent ?? ""),
    );
    expect(retry).toBeDefined();

    const before = { ...calls };
    await act(async () => {
      retry?.click();
    });
    await settle();

    // Only the failed read ran again.
    expect(calls.coverage).toBe(before.coverage + 1);
    expect(calls.console).toBe(before.console);
    expect(calls.truth).toBe(before.truth);
    expect(calls.board).toBe(before.board);
    expect(calls.workflow).toBe(before.workflow);

    // And the section now shows its number instead of the failure.
    expect(sectionOf("Binding coverage").querySelector('[role="alert"]')).toBeNull();
    expect(sectionOf("Binding coverage").textContent).toMatch(/Bound/i);
  });

  it("never prints the browser's words or a stack when the DATABASE read drops", async () => {
    // Exactly what supabase-js hands the list door when fetch() rejects:
    // the browser's words in `message`, the JavaScript stack in `details`.
    consoleFailure = new MandateDoorError({
      name: "MandateListDoorError",
      message: "TypeError: Failed to fetch",
      code: "",
      detail: "TypeError: Failed to fetch\n    at window.fetch (<anonymous>:2:194)\n    at async fetchWithRetry (chunk.js:30357:19)",
    });
    const mandates = sectionOf("Mandates");
    const retry = [...mandates.querySelectorAll("button")].find((b) =>
      /retry/i.test(b.textContent ?? ""),
    );
    // First load succeeded; press Retry to take the failing read.
    expect(retry).toBeUndefined();
    const refresh = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Refresh",
    );
    await act(async () => {
      refresh?.click();
    });
    await settle();
    const text = sectionOf("Mandates").querySelector('[role="alert"]')?.textContent ?? "";
    expect(text).toMatch(/mandate list/i);
    expect(text).not.toMatch(/Failed to fetch/);
    expect(text).not.toMatch(/fetchWithRetry|at window\.fetch/);
    expect(text).toMatch(/try again/i);
  });
});
