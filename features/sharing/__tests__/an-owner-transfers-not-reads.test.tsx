/**
 * 🚨 SHARE-LANE-2 (chair ruling 2026-09-25, the Google Workspace / Notion model).
 *
 * An organization's owner or admin does not open a personal Table they are not named on. What
 * they get instead is GOVERNANCE: an explicit, audited transfer. These tests hold the client half:
 *   1. The transfer dialog asks the store which personal Tables a member keeps (a count, never a
 *      name), refuses to send without a reason (and says why, instead of a dead button), and
 *      sends each Table through `custom.table_transfer_owner` with the chosen person and the
 *      reason, then prints the door's own sentence.
 *   2. The member row in organization settings carries "Transfer their personal tables…" for the
 *      organization's owners and admins only, and never on the viewer's own row.
 *   3. A Table's no-access page tells an owner/admin of the Table's own organization "You are not
 *      named on this table." and offers Transfer ownership…; a plain member sees nothing extra.
 *
 * RED against the tree before this lane (none of these controls existed); GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "87a6e699-3622-4869-8843-d0867456c0dd";
const DR = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const ORG = "5ba5aa1e-0000-4a00-8a00-000000000c01";
const TABLE = "5ba5aa1e-0000-4a00-8a00-00000000c0de";

const fetchMemberPersonalTables = jest.fn(async () => ({
  data: { count: 1, tableIds: [TABLE] },
  error: null,
}));
const transferTableOwner = jest.fn(async () => ({
  success: true,
  message: "My case notes now belongs to you. Dr. Reyes can still edit it.",
}));
jest.mock("@/features/sharing/service/tableTransfer", () => ({
  fetchMemberPersonalTables: (...a: unknown[]) => (fetchMemberPersonalTables as jest.Mock)(...a),
  transferTableOwner: (...a: unknown[]) => (transferTableOwner as jest.Mock)(...a),
}));

let role: { isAdmin: boolean; loading: boolean } = { isAdmin: true, loading: false };
jest.mock("@/features/organizations/hooks", () => ({
  useUserRole: () => role,
  useOrganizationMembers: () => ({
    members: [
      { userId: ME, role: "owner", user: { id: ME, email: "admin@admin.com", displayName: "Morgan Hale" } },
      { userId: DR, role: "admin", user: { id: DR, email: "test@test.com", displayName: "Dr. Reyes" } },
    ],
    loading: false,
    error: null,
  }),
}));
jest.mock("@/features/access-gate/service/accessDeniedContext", () => ({
  fetchAccessDeniedContext: async () => ({
    status: "denied",
    disclosure: "full",
    level: "none",
    isOwner: false,
    entity: { token: "record", label: "table", title: "My case notes" },
    owner: { userId: DR, displayName: "Dr. Reyes", avatarUrl: null, creatorHandle: null },
    organization: { id: ORG, name: "Cedar Hollow Veterinary", isPersonal: false, viewerIsMember: true },
    ancestor: null,
    request: null,
    canRequest: true,
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => ME }));

import { TransferTableOwnership } from "@/features/sharing/components/TransferTableOwnership";
import { MemberPersonalTablesAction } from "@/features/sharing/components/MemberPersonalTablesAction";
import { TableTransferOffer } from "@/features/sharing/components/TableTransferOffer";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMemberPersonalTables.mockClear();
  transferTableOwner.mockClear();
  role = { isAdmin: true, loading: false };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
const q = (sel: string) => document.body.querySelector(sel);
const typeInto = (el: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const people = [
  { id: ME, name: "Morgan Hale" },
  { id: DR, name: "Dr. Reyes" },
];

describe("the transfer dialog", () => {
  it("counts the member's personal tables, needs a reason, and sends each through the door", async () => {
    act(() =>
      root.render(
        <TransferTableOwnership
          open
          onOpenChange={jest.fn()}
          organizationId={ORG}
          organizationName="Cedar Hollow Veterinary"
          from={{ id: DR, name: "Dr. Reyes" }}
          people={people}
          viewerId={ME}
        />,
      ),
    );
    await flush();
    expect(fetchMemberPersonalTables).toHaveBeenCalledWith(ORG, DR);
    const dialog = q("[data-table-transfer]")!;
    expect(dialog.textContent).toContain("Dr. Reyes keeps 1 personal table in Cedar Hollow Veterinary.");
    expect(dialog.textContent).toContain("You cannot open it");
    expect(dialog.textContent).toContain("stays on as an editor");
    // the default recipient is the viewer, never the current owner
    const to = q("[data-transfer-to]") as HTMLSelectElement;
    expect(to.value).toBe(ME);
    expect(Array.from(to.options).map((o) => o.value)).not.toContain(DR);

    // no reason: said, not sent
    act(() => (q("[data-transfer-go]") as HTMLButtonElement).click());
    expect(transferTableOwner).not.toHaveBeenCalled();
    expect(q("[data-transfer-need-reason]")?.textContent).toContain("Say why.");

    typeInto(q("[data-transfer-reason]") as HTMLTextAreaElement, "Dr. Reyes is moving to the Irvine clinic.");
    await act(async () => {
      (q("[data-transfer-go]") as HTMLButtonElement).click();
    });
    await flush();
    expect(transferTableOwner).toHaveBeenCalledWith(TABLE, ME, "Dr. Reyes is moving to the Irvine clinic.");
    expect(q("[data-transfer-said]")?.textContent).toContain("My case notes now belongs to you.");
  });

  it("says so when the member keeps no personal tables", async () => {
    fetchMemberPersonalTables.mockResolvedValueOnce({ data: { count: 0, tableIds: [] }, error: null });
    act(() =>
      root.render(
        <TransferTableOwnership
          open
          onOpenChange={jest.fn()}
          organizationId={ORG}
          organizationName="Cedar Hollow Veterinary"
          from={{ id: DR, name: "Dr. Reyes" }}
          people={people}
          viewerId={ME}
        />,
      ),
    );
    await flush();
    expect(q("[data-table-transfer]")?.textContent).toContain("Dr. Reyes keeps no personal tables in Cedar Hollow Veterinary.");
    expect(q("[data-transfer-go]")).toBeNull();
  });
});

describe("the member row in organization settings", () => {
  const render = (viewerGoverns: boolean, memberId = DR) =>
    act(() =>
      root.render(
        <MemberPersonalTablesAction
          organizationId={ORG}
          organizationName="Cedar Hollow Veterinary"
          member={{ id: memberId, name: "Dr. Reyes" }}
          people={people}
          viewerId={ME}
          viewerGoverns={viewerGoverns}
        />,
      ),
    );

  it("offers the transfer to an owner or admin", () => {
    render(true);
    expect(q(`[data-member-transfer-tables="${DR}"]`)?.textContent).toContain("Transfer their personal tables");
  });
  it("is absent for a plain member and on the viewer's own row", () => {
    render(false);
    expect(q("[data-member-transfer-tables]")).toBeNull();
    render(true, ME);
    expect(q("[data-member-transfer-tables]")).toBeNull();
  });
});

describe("a Table's no-access page", () => {
  it("tells an owner/admin of the Table's organization they are not named, and offers the transfer", async () => {
    act(() => root.render(<TableTransferOffer tableId={TABLE} />));
    await flush();
    const offer = q("[data-table-transfer-offer]")!;
    expect(offer.textContent).toContain("You are not named on this table.");
    expect(offer.textContent).toContain("does not open for the owners and admins of Cedar Hollow Veterinary");
    act(() => (q("[data-table-transfer-open]") as HTMLButtonElement).click());
    await flush();
    expect(q("[data-table-transfer]")?.textContent).toContain("Dr. Reyes keeps 1 personal table");
    expect(fetchMemberPersonalTables).not.toHaveBeenCalled();
  });

  it("adds nothing for a plain member", async () => {
    role = { isAdmin: false, loading: false };
    act(() => root.render(<TableTransferOffer tableId={TABLE} />));
    await flush();
    expect(q("[data-table-transfer-offer]")).toBeNull();
  });
});
