/**
 * The record search in "Add a reference" lists a person's records MOST RECENT
 * FIRST, and two records with the same name can be told apart.
 *
 * THE DEFECT (G2 review, 2026-10-02): the unfiltered list was alphabetical
 * (the universal title search sorts by title and returns no date), and two
 * tasks both named "G2 duplicate" rendered as two identical rows.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecordReferencePicker, candidateSecondaryLine } from "@/features/matrx-envelope/components/ReferenceTypeAdder";

const NOW = Date.parse("2026-10-02T12:00:00Z");

const recent = [
  { id: "00000000-0000-4000-8000-000000000003", title: "Zebra launch", updatedAt: "2026-10-02T11:58:00Z" },
  { id: "00000000-0000-4000-8000-000000000001", title: "G2 duplicate", updatedAt: "2026-10-01T09:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000002", title: "G2 duplicate", updatedAt: "2026-09-20T09:00:00Z" },
];

const useKindItems = jest.fn((..._args: unknown[]) => ({
  items: recent,
  loading: false,
  loadingMore: false,
  hasMore: false,
  loadMore: () => undefined,
  error: null,
  reload: () => undefined,
  pageSize: 50,
}));

jest.mock("@/features/scopes/hooks/useKindItems", () => ({
  useKindItems: (...args: unknown[]) => useKindItems(...args),
}));

// This file proves order and the date line; facts are proven in
// same-named-records-tell-apart.test.tsx.
jest.mock("@/features/scopes/service/recordFacts", () => {
  const actual = jest.requireActual("@/features/scopes/service/recordFacts");
  return { ...actual, fetchRecordFacts: async () => new Map() };
});
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false, error: null, refresh: () => undefined }),
}));

// The alphabetical title search the picker used before — never reached for a
// plain type; if it is, the rows come back A→Z with no dates.
jest.mock("@/features/scopes/hooks/useUniversalEntitySearch", () => ({
  useUniversalEntitySearch: () => ({
    results: [...recent]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((r) => ({ id: r.id, title: r.title, token: "task" })),
    loading: false,
    isRecents: false,
    source: "candidates",
    failures: [],
    error: null,
    status: "ready",
  }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderPicker() {
  act(() => {
    root.render(<RecordReferencePicker token="task" onPickMany={() => undefined} />);
  });
  return [...container.querySelectorAll('[role="option"]')];
}

describe("the reference picker's record search", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it("opens on the most recently changed records, in the order the server ranked them", () => {
    const rows = renderPicker();
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Zebra launch"),
      expect.stringContaining("G2 duplicate"),
      expect.stringContaining("G2 duplicate"),
    ]);
    // Every list the person can see — never narrowed by the active org.
    expect(useKindItems).toHaveBeenCalledWith("task", { kind: "all" }, "");
  });

  it("gives two records with the same name different secondary lines", () => {
    const dupes = renderPicker()
      .filter((r) => r.textContent?.includes("G2 duplicate"))
      .map((r) => r.textContent);
    expect(dupes).toHaveLength(2);
    expect(dupes[0]).not.toEqual(dupes[1]);
  });

  it("the secondary line fits its 60-character slot", () => {
    expect(candidateSecondaryLine("2026-10-02T11:58:00Z", NOW)).toBe("Edited 2 minutes ago");
    expect(candidateSecondaryLine("2026-10-01T09:00:00Z", NOW)).toBe("Edited yesterday");
    expect(candidateSecondaryLine(null, NOW)).toBeNull();
    for (const iso of ["2020-01-01T00:00:00Z", "2026-09-20T09:00:00Z"]) {
      expect(candidateSecondaryLine(iso, NOW)!.length).toBeLessThanOrEqual(60);
    }
  });
});
