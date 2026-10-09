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

const items: { current: Array<{ id: string; title: string; updatedAt: string | null }> } = {
  current: invoices,
};
const facts = { current: invoiceFacts as Map<string, RecordFact> };
const createdAt = { current: new Map<string, string>() };

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
  return {
    ...actual,
    fetchRecordFacts: jest.fn(async () => facts.current),
    fetchRecordCreatedAt: jest.fn(async () => createdAt.current),
  };
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

async function renderPicker(token: "note" | "conversation" | "task") {
  await act(async () => {
    root.render(<RecordReferencePicker token={token} onPickMany={() => undefined} />);
  });
  // Let the facts read resolve, then the created-at read for colliding rows.
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
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
    // A member of two organizations sees each row's organization — in every
    // search, however few organizations the results happen to span (G18).
    for (const r of rows) expect(r).toContain("Harbor Dental");
  });

  it("a search narrowed to one result still names its organization (one rule for every action)", async () => {
    // G18 review: the Update search named a Workbook's organization and the
    // Delete search, narrowed to one row, did not.
    items.current = [{ id: id(31), title: "G17 workbook", updatedAt: "2026-10-02T11:49:00Z" }];
    facts.current = new Map([[id(31), { organizationId: ORG_A, fact: null }]]);
    const rows = await renderPicker("note");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Harbor Dental");
  });

  it("a member of one organization never sees it repeated", () => {
    const rows = [
      { id: id(41), title: "A", updatedAt: null },
      { id: id(42), title: "B", updatedAt: null },
    ];
    const out = recordRows(
      rows,
      new Map(rows.map((r) => [r.id, { organizationId: ORG_A, fact: null }])),
      () => "Harbor Dental",
      NOW,
      null,
      false,
    );
    for (const r of out) expect(r.secondary ?? "").not.toContain("Harbor Dental");
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
    expect(out[1]!.secondary).toBe("Northwind · In progress · Edited 1 hour ago");
  });

  it("a note's first words never repeat its title or print a fence", () => {
    const { snippet } = jest.requireActual("@/features/scopes/service/recordFacts");
    expect(snippet("Plan\n\n```matrx\n{\"__kind\":\"x\"}\n```\nBring the dolly")).toBe("Plan Bring the dolly");
    const out = recordRows(
      [{ id: id(1), title: "G5 tell me of it", updatedAt: null }],
      new Map([[id(1), { organizationId: ORG_A, fact: "G5 tell me of it" }]]),
      () => null,
      NOW,
    );
    expect(out[0]!.secondary).toBeNull();
  });

  // G8B review (2026-10-02, nightly clone): a dozen "Leave request — Tomas
  // Iversen / Oak Street Studio · Completed · Edited 2 days ago" rows were
  // still identical. Rows whose title AND line collide name when each was
  // created — with the time when two share a day — never a raw id.
  it("rows that still collide are told apart by when each was created", async () => {
    const title = "Leave request — Tomas Iversen";
    items.current = [31, 32, 33].map((n) => ({ id: id(n), title, updatedAt: "2026-09-30T12:00:00Z" }));
    facts.current = new Map(items.current.map((r) => [r.id, { organizationId: ORG_A, fact: "Completed" }]));
    createdAt.current = new Map([
      [id(31), "2026-08-28T04:05:20Z"],
      [id(32), "2026-08-28T06:17:23Z"],
      [id(33), "2026-08-20T09:00:00Z"],
    ]);
    const rows = await renderPicker("task");
    expect(rows).toHaveLength(3);
    expect(new Set(rows).size).toBe(3);
    for (const r of rows) {
      expect(r).toContain("Created ");
      expect(r).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
    createdAt.current = new Map();
  });

  it("a collided line still fits its 60-character slot", () => {
    const rows = [41, 42].map((n) => ({ id: id(n), title: "Same", updatedAt: "2026-09-30T12:00:00Z" }));
    const out = recordRows(
      rows,
      new Map(rows.map((r, i) => [r.id, { organizationId: i ? ORG_B : ORG_A, fact: "Completed" }])),
      (org) => (org === ORG_A ? "Oak Street Studio" : "Oak Street Studio West Annex"),
      NOW,
      new Map([
        [id(41), "2026-08-28T04:05:20Z"],
        [id(42), "2026-08-28T06:17:23Z"],
      ]),
    );
    for (const row of out) expect(row.secondary!.length).toBeLessThanOrEqual(60);
  });

  // G10A review (2026-10-02, nightly clone): "Timecard approval — Elias
  // Navarro · Oak Street Studio · Completed · Created Aug 29, 5:29 PM" three
  // times, word for word — seeded inside one minute. The ladder climbs to the
  // second, then to the last edit, then to a quiet ordinal; never a raw id.
  describe("the ladder past the minute", () => {
    const title = "Timecard approval — Elias Navarro";
    const three = (updated: string[]) =>
      [61, 62, 63].map((n, i) => ({ id: id(n), title, updatedAt: updated[i]! }));
    const sameFacts = (rows: Array<{ id: string }>) =>
      new Map<string, RecordFact>(rows.map((r) => [r.id, { organizationId: ORG_A, fact: "Completed" }]));
    const noRawId = (line: string | null) =>
      expect(line ?? "").not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{12}/);

    it("rows created in the same minute are told apart by the second", () => {
      const rows = three(Array(3).fill("2026-09-30T12:00:00Z"));
      const out = recordRows(rows, sameFacts(rows), () => null, NOW, new Map([
        [id(61), "2026-08-29T17:29:05Z"],
        [id(62), "2026-08-29T17:29:31Z"],
        [id(63), "2026-08-29T17:29:48Z"],
      ]));
      expect(new Set(out.map((r) => r.secondary)).size).toBe(3);
      for (const r of out) {
        expect(r.secondary).toMatch(/Created .*:\d\d:\d\d/);
        expect(r.secondary!.length).toBeLessThanOrEqual(60);
        noRawId(r.secondary);
      }
    });

    it("rows created in the same second are told apart by their last edit", () => {
      const rows = three(["2026-09-30T12:00:01Z", "2026-09-30T12:00:02Z", "2026-09-30T12:00:03Z"]);
      const created = new Map(rows.map((r) => [r.id, "2026-08-29T17:29:05Z"]));
      const out = recordRows(rows, sameFacts(rows), () => null, NOW, created);
      expect(new Set(out.map((r) => r.secondary)).size).toBe(3);
      for (const r of out) {
        expect(r.secondary).toContain("Edited ");
        noRawId(r.secondary);
      }
    });

    it("rows identical in everything a person can read get a quiet ordinal", () => {
      const rows = three(Array(3).fill("2026-09-30T12:00:00Z"));
      const created = new Map(rows.map((r) => [r.id, "2026-08-29T17:29:05Z"]));
      const out = recordRows(rows, sameFacts(rows), () => null, NOW, created);
      expect(out.map((r) => r.secondary?.split(" · ").pop())).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
      for (const r of out) {
        expect(r.secondary!.length).toBeLessThanOrEqual(60);
        noRawId(r.secondary);
      }
    });

    it("a type with no created time still never shows identical rows", () => {
      const rows = three(Array(3).fill("2026-09-30T12:00:00Z"));
      const out = recordRows(rows, sameFacts(rows), () => null, NOW, new Map());
      expect(new Set(out.map((r) => r.secondary)).size).toBe(3);
    });

    it("while the created times are still being read, nothing climbs yet", () => {
      const rows = three(Array(3).fill("2026-09-30T12:00:00Z"));
      const out = recordRows(rows, sameFacts(rows), () => null, NOW, null);
      expect(new Set(out.map((r) => r.secondary)).size).toBe(1);
    });
  });

  it("a title wraps to two lines instead of cutting off its last words", async () => {
    items.current = [{ id: id(51), title: "Clean the treatment room before the patient (checkout)", updatedAt: null }];
    facts.current = new Map();
    await renderPicker("task");
    const title = container.querySelector('[role="option"] span span');
    expect(title?.className).toContain("line-clamp-2");
    expect(title?.className).not.toContain("truncate");
  });

  it("the search names the type by its one display name (Chat → \"Search chats…\")", async () => {
    items.current = [];
    await renderPicker("conversation");
    const input = container.querySelector("input");
    expect(input?.getAttribute("placeholder")).toBe("Search chats…");
  });
});
