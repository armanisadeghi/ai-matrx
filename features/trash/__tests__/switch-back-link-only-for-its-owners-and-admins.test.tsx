/**
 * Lane SWITCH-BACK-CARRIES (VERIFIER-26 item 3) — personal Trash lists older tables that moved
 * with an organization's Data tables switch. The "Switch back" link goes to that organization's
 * settings, so it shows ONLY to that organization's owners and admins. Anyone else (a member, or
 * a platform admin who is not in the organization at all) reads "Moved to the new system by its
 * organization" and gets no link — never a door into an organization they cannot act on.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
const forUser = jest.fn();
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: { forUser: (...a: unknown[]) => forUser(...a) },
}));

import { TrashList } from "../components/TrashList";

const MINE = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group: owner
const MEMBER_ONLY = "1fedf48b-9a77-432e-a5e3-2d93ee140564"; // a plain member there
const NOT_MINE = "3e790542-0000-4000-8000-000000000000"; // an organization I am not in
const row = (id: string, title: string, organization_id: string) => ({
  artifact_kind: "dataset",
  entity_token: "dataset",
  label: "Older table (moved to the new system)",
  id,
  title,
  deleted_at: "2026-09-26T13:18:00Z",
  organization_id,
  is_mine: true,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "trash_counts") return { data: [], error: null };
    if (fn === "trash_list")
      return {
        data: [
          row("b00bde4d-1adc-4682-88eb-57453aabf014", "Hygiene Recall Schedule", MINE),
          row("26712b2d-0000-4000-8000-000000000001", "Service Calls", MEMBER_ONLY),
          row("99999999-0000-4000-8000-000000000002", "Coding Accounts", NOT_MINE),
        ],
        error: null,
      };
    throw new Error(`unexpected rpc ${fn}`);
  });
  forUser.mockReset();
  forUser.mockResolvedValue({
    ok: true,
    data: {
      memberships: [
        { containerId: MINE, role: "owner" },
        { containerId: MEMBER_ONLY, role: "member" },
      ],
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("personal Trash links Switch back only into organizations I own or administer", async () => {
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const rows = [...container.querySelectorAll("li")];
  const byTitle = (t: string) => rows.find((li) => li.textContent?.includes(t))!;

  const mine = byTitle("Hygiene Recall Schedule");
  expect(mine.querySelector('a[data-testid="moved-older-table-switch-back"]')?.getAttribute("href")).toBe(
    `/organizations/${MINE}/settings#data`,
  );

  for (const title of ["Service Calls", "Coding Accounts"]) {
    const other = byTitle(title);
    expect(other.querySelector("a")).toBeNull();
    expect(other.textContent).toContain("Moved to the new system by its organization");
    expect(other.textContent).not.toContain("Switch back");
    expect(other.textContent).not.toContain("Restore");
  }
});
