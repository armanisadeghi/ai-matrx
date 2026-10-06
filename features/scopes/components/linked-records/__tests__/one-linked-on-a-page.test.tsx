/**
 * ONE "LINKED" ON A PAGE (AP-4). When the page also mounts "Linked records", the older panel must not
 * add a second "Linked" heading or a contradicting "Nothing linked yet" — it keeps its direct links
 * and the "Link a record" action, and nothing else. Alone, it still reads as before.
 *
 * Breaks: a second heading or empty line returning under "Linked records" -> "no second heading" red;
 * the action dropped -> "keeps the action" red; Unlink lost in the folded form -> "unlink" red.
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
  id: `${direction}-${otherType}-${otherId}`, direction, otherType, otherId, role, label: null, position: null, metadata: {}, orgId: null, createdAt: "2026-10-06T00:00:00Z",
});
edgesByKey["party:p1"] = [edge("incoming", "note", "n1", "anchored_to")];

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

async function render(shownElsewhere: boolean, id: string) {
  await act(async () => {
    root.render(<LinkedRecordsSection token="party" id={id} title="Dana" backLinksShownElsewhere={shownElsewhere} />);
  });
  await act(async () => {});
}

describe("one Linked on a page", () => {
  it("no second heading and no empty line when the page's Linked records is above", async () => {
    await render(true, "empty");
    expect(host.querySelector("h3")).toBeNull();
    expect(host.textContent).not.toContain("Nothing linked yet");
    expect(host.textContent).not.toMatch(/^Linked/);
  });

  it("keeps the Link a record action", async () => {
    await render(true, "empty");
    expect(host.querySelector('[data-linked-records-action="link-a-record"]')?.textContent).toContain("Link a record");
  });

  it("still lists a direct link and unlinks it", async () => {
    await render(true, "p1");
    expect(host.querySelector('[data-linked-record="note:n1"]')).not.toBeNull();
    expect(host.querySelector("h3")).toBeNull();
    await act(async () => {
      (host.querySelector('[data-linked-record="note:n1"] button') as HTMLButtonElement).click();
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("alone, it keeps its own heading and empty line", async () => {
    await render(false, "empty");
    expect(host.querySelector("h3")?.textContent).toContain("Linked");
    expect(host.textContent).toContain("Nothing linked yet");
  });
});
