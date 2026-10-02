/**
 * Same-named records can be told apart in the reference picker's record search.
 *
 * THE DEFECT (G5 review, 2026-10-02, nightly clone): eight "invoices thing /
 * Edited Aug 11" rows came from two organizations, and three chats differed
 * only by "11 min / 12 min ago". The secondary line carried a date and nothing
 * else.
 *
 * The fix this proves: when the rows span organizations, each row names its
 * organization (from the person's memberships — never the active org), plus one
 * fact that tells records apart (a chat's length, a task's status, a note's
 * first words); the line never passes 60 characters.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  RecordReferencePicker,
  recordRows,
} from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import type { RecordFact } from "@/features/scopes/service/recordFacts";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const ORG_A = "0000000a-0000-4000-8000-000000000000";
const ORG_B = "0000000b-0000-4000-8000-000000000000";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Eight same-named records, same day, two organizations.
const invoices = Array.from({ length: 8 }, (_, i) => ({
  id: id(i + 1),
  title: "invoices thing",
  updatedAt: "2026-08-11T09:00:00Z",
}));
const invoiceFacts = new Map<string, RecordFact>(
  invoices.map((r, i) => [r.id, { organizationId: i < 4 ? ORG_A : ORG_B, fact: null }]),
);

const items = { current: invoices };
const facts = { current: invoiceFacts as Map<string, RecordFact> };

jest.mock("@/features/scopes/hooks/useKindItems", () => ({
  useKindItems: () => ({
    items: items.current,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: () => undefined,
    error: null,
    reload: () => undefined,
    pageSize: 50,
  }),
}));

jest.mock("@/features/scopes/service/recordFacts", () => {
  const actual = jest.requireActual("@/features/scopes/service/recordFacts");
  return { ...actual, fetchRecordFacts: jest.fn(async () => facts.current) };
});

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [
      { id: "0000000a-0000-4000-8000-000000000000", name: "Harbor Dental" },
      { id: "0000000b-0000-4000-8000-000000000000", name: "Northwind" },
    ],
    loading: false,
    error: null,
    refresh: () => undefined,
  }),
}));

jest.mock("@/features/scopes/hooks/useUniversalEntitySearch", () => ({
  useUniversalEntitySearch: () => ({
    results: [],
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

async function renderPicker(token: "note" | "conversation") {
  await act(async () => {
    root.render(<RecordReferencePicker token={token} onPickMany={() => undefined} />);
  });
  // Let the facts read resolve.
  await act(async () => {
    await Promise.resolve();
  });
  return [...container.querySelectorAll('[role="option"]')].map((r) => r.textContent ?? "");
}

describe("same-named records in the record search", () => {
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

  it("rows from two organizations each name their organization", async () => {
    items.current = invoices;
    facts.current = invoiceFacts;
    const rows = await renderPicker("note");
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.includes("Harbor Dental"))).toHaveLength(4);
    expect(rows.filter((r) => r.includes("Northwind"))).toHaveLength(4);
  });

  it("three chats that differ only by minutes are told apart by what they hold", async () => {
    items.current = [
      { id: id(21), title: "Untitled chat", updatedAt: "2026-10-02T11:49:00Z" },
      { id: id(22), title: "Untitled chat", updatedAt: "2026-10-02T11:48:00Z" },
      { id: id(23), title: "Untitled chat", updatedAt: "2026-10-02T11:48:00Z" },
    ];
    facts.current = new Map([
      [id(21), { organizationId: ORG_A, fact: "2 messages" }],
      [id(22), { organizationId: ORG_A, fact: "14 messages" }],
      [id(23), { organizationId: ORG_A, fact: "1 message" }],
    ]);
    const rows = await renderPicker("conversation");
    expect(new Set(rows).size).toBe(3);
    // One organization: it is not repeated on every row.
    for (const r of rows) expect(r).not.toContain("Harbor Dental");
  });

  it("the line never passes its 60-character slot", () => {
    const longFacts = new Map<string, RecordFact>([
      [id(1), { organizationId: ORG_A, fact: "A very long first line of a note that goes on and on" }],
      [id(2), { organizationId: ORG_B, fact: "In progress" }],
    ]);
    const out = recordRows(
      [
        { id: id(1), title: "x", updatedAt: "2020-01-01T00:00:00Z" },
        { id: id(2), title: "x", updatedAt: "2026-10-02T11:00:00Z" },
      ],
      longFacts,
      (org) => (org === ORG_A ? "A Rather Long Organization Name Incorporated" : "Northwind"),
      NOW,
    );
    for (const row of out) expect(row.secondary!.length).toBeLessThanOrEqual(60);
    expect(out[1]!.secondary).toBe("Northwind · In progress · Edited 1 h ago");
  });
});
