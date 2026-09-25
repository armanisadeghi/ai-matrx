/**
 * MOVE-AND-OUTSIDER (VERIFIER-19 finding 3) — a table shared with her by
 * invitation and not yet opened says so on its own page, with the one step,
 * instead of "You have not been given this table".
 *
 * THE USE CASE. Harborview Property Management invited dana.whitfield@… to its
 * "Unit turnover checklist" before she had an account; she signed up, then opened
 * the table's address from her email client's history. The store lists her own
 * pending invitations (`custom.table_share_outside_for_me`); the page finds the
 * one for this table and links to it. RED before PendingTableInvitation existed
 * (the page drew only the refusal); GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "9d41c2e7-5b3a-4f08-a6d1-2c7e8f90b3a5";
const mockPending = jest.fn();
jest.mock("../outsideShareService", () => ({
  __esModule: true,
  myPendingTableInvitations: () => mockPending(),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PendingTableInvitation, usePendingTableInvitation } = require("../PendingTableInvitation");

function Probe({ tableId }: { tableId: string }) {
  const found = usePendingTableInvitation(tableId, true);
  if (found === undefined) return <p>asking</p>;
  if (found === null) return <p>You have not been given this table</p>;
  return <PendingTableInvitation invitation={found} />;
}

async function draw(tableId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Probe tableId={tableId} />));
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
  const text = host.textContent ?? "";
  const href = host.querySelector("a")?.getAttribute("href") ?? null;
  act(() => root.unmount());
  host.remove();
  return { text, href };
}

describe("a pending table invitation on the table's own page", () => {
  beforeEach(() =>
    mockPending.mockResolvedValue([
      {
        invitation_id: "c5a0e1f2-7d3b-4c9e-8a61-0b2d4f6e8a13",
        organization_id: "6069a466-1445-42df-a64e-cf37ecdc1b99",
        organization: "Harborview Property Management",
        table_id: TABLE,
        table_name: "Unit turnover checklist",
        level: "viewer",
        level_label: "Viewer",
        token: "tok-5f2c",
        expires_at: null,
        say: "Harborview Property Management shared Unit turnover checklist with you as a viewer.",
      },
    ]),
  );

  it("names who shared it and links to the invitation", async () => {
    const seen = await draw(TABLE);
    expect(seen.text).toContain("Harborview Property Management shared Unit turnover checklist with you");
    expect(seen.text).not.toContain("You have not been given this table");
    expect(seen.href).toBe("/invitations/table/accept/tok-5f2c");
  });

  it("another table keeps the honest refusal", async () => {
    const seen = await draw("0b7e3a91-2c4d-4e5f-8a6b-7c8d9e0f1a2b");
    expect(seen.text).toContain("You have not been given this table");
  });
});
