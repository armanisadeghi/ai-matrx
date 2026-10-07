/** @jest-environment jsdom */
//
// H5 (round 5) — an `update` proposal's current → proposed values were
// JSON.stringified into an inline markdown leaf, so a column whose value is a
// kind printed its `__kind` JSON. A kind-carrying value goes through the one
// value door (compact); a plain value stays inline text.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const CARDS = { __kind: "flashcard_set", title: "Cells", cards: [{ front: "Mitochondria", back: "Makes ATP" }] };

jest.mock("../applyListChange", () => ({
  readListTarget: async () => ({
    status: "read",
    snapshot: {
      label: "Study deck",
      fields: [
        { name: "notes", label: "Notes" },
        { name: "deck", label: "Deck" },
        { name: "title", label: "Title" },
      ],
      rows: [{ id: "r1", values: { notes: "Old notes", deck: CARDS, title: "Cell biology" } }],
    },
  }),
  proposalStanding: () => "open",
  applyListChange: jest.fn(),
}));
jest.mock("../decisions", () => ({
  fetchProposalDecisions: async () => ({}),
  recordProposalDecision: jest.fn(),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({
  RichContent: ({ source }: { source: string }) => <span data-testid="inline-text">{source}</span>,
}));
jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  KindValueFrontDoor: ({ density }: { density?: string }) => (
    <span data-testid="value-door" data-density={density ?? ""} />
  ),
}));

import { ListChangeProposalView } from "../ListChangeProposalView";
import type { ListChangeProposalValue } from "@/features/content-ir/kinds/list-change-proposal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("a kind value in an update's diff goes through the value door; plain values stay text", async () => {
  const proposal = {
    __kind: "list_change_proposal",
    target: { kind: "scope_dataset", label: "Study deck" },
    summary: "Refresh the deck",
    proposals: [
      {
        id: "p1",
        action: "update",
        title: "Cell biology",
        reason: "The deck was out of date",
        rowId: "r1",
        patch: {
          notes: 'New cards:\n\n```json\n{"__kind":"flashcard_set","title":"Cells","cards":[]}\n```',
          deck: { ...CARDS, title: "Cells, revised" },
          title: "Cell biology, revised",
        },
      },
    ],
    unreadable: [],
  } as unknown as ListChangeProposalValue;

  await act(async () => {
    root.render(<ListChangeProposalView proposal={proposal} messageId="m1" />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // notes (after), deck (before + after) → three value doors.
  expect(host.querySelectorAll('[data-testid="value-door"]')).toHaveLength(3);
  for (const door of host.querySelectorAll('[data-testid="value-door"]')) {
    expect(door.getAttribute("data-density")).toBe("inline");
  }
  expect(host.textContent).not.toContain("__kind");
  // Plain values stay inline text.
  expect(host.textContent).toContain("Old notes");
  expect(host.textContent).toContain("Cell biology, revised");
});
