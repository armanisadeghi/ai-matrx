/**
 * A LINK SHOWS ON BOTH ENDS (lane 3 W1.4). "Link a record…" writes ONE anchored_to edge, picked →
 * target. The Linked section on the TARGET reads it as incoming and on the PICKED record as
 * outgoing — both must list it, by name. A store record's own reference (record → party, role =
 * the field key) lists on both ends too; record ↔ record relations and unrelated roles do not.
 * Unlink archives the edge in its real orientation.
 *
 * Breaks each test names:
 * - the section filters one direction only → "either end" red.
 * - store references dropped or record↔record leaking in → "which edges" red.
 * - unlink sent with source/target swapped for an incoming edge → "unlink" red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const edgesByKey: Record<string, unknown[]> = {};
const remove = jest.fn(async () => ({ ok: true }));
jest.mock("@/features/scopes/hooks/useAssociations", () => ({
  useAssociations: ({ type, id }: { type: string; id: string }) => ({
    edges: edgesByKey[`${type}:${id}`] ?? [],
    status: "ready",
    error: null,
  }),
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ remove }) }));
jest.mock("@/features/scopes/service/entityTitles", () => ({
  entityTitleFallback: (t: string) => (t === "record" ? "Record" : t),
  fetchEntityTitles: async (token: string, ids: string[]) =>
    new Map(ids.map((id) => [id, `${token} ${id}`])),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: (p: { token: string; id: string; name: string; extraActions?: React.ReactNode }) => (
    <span data-ref={`${p.token}:${p.id}`}>
      {p.name}
      {p.extraActions}
    </span>
  ),
}));
jest.mock("@/features/overlays/openers/linkRecordSheet", () => ({ useOpenLinkRecordSheet: () => jest.fn() }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { LinkedRecordsSection, isLinkEdge } from "../LinkedRecordsSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const edge = (direction: "outgoing" | "incoming", otherType: string, otherId: string, role: string | null) => ({
  id: `${direction}-${otherType}-${otherId}`,
  direction,
  otherType,
  otherId,
  role,
  label: null,
  position: null,
  metadata: {},
  orgId: null,
  createdAt: "2026-10-03T00:00:00Z",
});

// One link, Dana Whitfield's intake note → her CRM party, seen from both ends.
edgesByKey["party:p1"] = [edge("incoming", "note", "n1", "anchored_to"), edge("incoming", "record", "r1", "patient"), edge("outgoing", "project", "x", null)];
edgesByKey["note:n1"] = [edge("outgoing", "party", "p1", "anchored_to")];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  remove.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(token: string, id: string) {
  await act(async () => {
    root.render(<LinkedRecordsSection token={token} id={id} title="" />);
  });
  await act(async () => {});
  return [...host.querySelectorAll("[data-linked-record]")].map((n) => n.getAttribute("data-linked-record"));
}

describe("a link shows on both ends", () => {
  it("either end: the target lists the picked record, the picked record lists the target", async () => {
    expect(await render("party", "p1")).toContain("note:n1");
    expect(await render("note", "n1")).toEqual(["party:p1"]);
    expect(host.textContent).toContain("party p1");
  });

  it("which edges: store references count, record↔record and unrelated roles do not", () => {
    expect(isLinkEdge("party", edge("incoming", "record", "r1", "patient"))).toBe(true);
    expect(isLinkEdge("record", edge("outgoing", "party", "p1", "patient"))).toBe(true);
    expect(isLinkEdge("record", edge("outgoing", "record", "r2", "patient"))).toBe(false);
    expect(isLinkEdge("party", edge("outgoing", "project", "x", null))).toBe(false);
  });

  it("unlink: an incoming link is archived as other → this", async () => {
    await render("party", "p1");
    const button = host.querySelector('[data-linked-record="note:n1"] button') as HTMLButtonElement;
    await act(async () => button.click());
    expect(remove).toHaveBeenCalledWith({ sourceType: "note", sourceId: "n1", targetType: "party", targetId: "p1", role: "anchored_to" });
  });
});
