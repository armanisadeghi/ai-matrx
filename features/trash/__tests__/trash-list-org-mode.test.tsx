/**
 * Lane TRASH-2 — ONE Trash list, two scopes.
 *
 * Organization mode reads the organization's doors (never the personal ones), names who archived
 * each row, filters by member, pages 50 at a time across kinds, and restores through the audited
 * org door. Personal mode reads only the personal doors and has no member filter at all.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { TrashList } from "../components/TrashList";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const OWNER = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";

const orgRow = {
  artifact_kind: "pc_show",
  entity_token: "pc_show",
  label: "Podcast show",
  id: "11111111-1111-4111-8111-111111111111",
  title: "Harbor Dental Weekly",
  deleted_at: "2026-09-25T20:00:00Z",
  organization_id: ORG,
  is_mine: false,
  owner_id: OWNER,
  owner_label: "Dana Ruiz",
};

function answer(fn: string, args: Record<string, unknown>) {
  if (fn === "org_trash_counts") return { data: [{ artifact_kind: "pc_show", label: "Podcast show", n: 1 }], error: null };
  if (fn === "org_trash_list") return { data: args.p_offset === 0 ? [orgRow] : [], error: null };
  if (fn === "org_trash_restore") return { data: { restored: true, message: "Harbor Dental Weekly restored." }, error: null };
  if (fn === "trash_counts") return { data: [], error: null };
  if (fn === "trash_list") return { data: [], error: null };
  throw new Error(`unexpected rpc ${fn}`);
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => answer(fn, args));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("organization mode reads the organization's doors, names the owner, and restores through the audited door", async () => {
  await act(async () => {
    root.render(
      <TrashList
        scope={{ mode: "organization", organizationId: ORG, members: [{ userId: OWNER, label: "Dana Ruiz" }] }}
      />,
    );
  });
  await flush();

  const called = rpc.mock.calls.map((c) => c[0]);
  expect(called).toEqual(expect.arrayContaining(["org_trash_counts", "org_trash_list"]));
  expect(called).not.toContain("trash_list");
  expect(called).not.toContain("trash_counts");
  expect(rpc).toHaveBeenCalledWith("org_trash_list", {
    p_organization_id: ORG,
    p_kinds: undefined,
    p_member: undefined,
    p_limit: 50,
    p_offset: 0,
  });

  expect(container.textContent).toContain("Harbor Dental Weekly");
  expect(container.textContent).toContain("Dana Ruiz");
  expect(container.querySelector('[aria-label="Filter by member"]')).not.toBeNull();

  const restore = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Restore"))!;
  await act(async () => {
    restore.click();
  });
  await flush();
  expect(rpc).toHaveBeenCalledWith("org_trash_restore", {
    p_organization_id: ORG,
    p_token: "pc_show",
    p_id: orgRow.id,
  });
  expect(called).not.toContain("entity_undelete");
  expect(rpc.mock.calls.map((c) => c[0])).not.toContain("entity_undelete");
});

test("personal mode reads only the personal doors and has no member filter", async () => {
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();
  const called = rpc.mock.calls.map((c) => c[0]);
  expect(called).toEqual(expect.arrayContaining(["trash_counts", "trash_list"]));
  expect(called.some((f: string) => f.startsWith("org_trash"))).toBe(false);
  expect(container.querySelector('[aria-label="Filter by member"]')).toBeNull();
  expect(container.textContent).toContain("Nothing in the trash.");
});
