/**
 * Lane SWITCH-AFTERMATH (C) — after an organization presses Data tables → new system, its older
 * tables sit in Trash. Each one must say it MOVED (not a bare "Dataset" row) and offer the one
 * action that works: Switch back, which restores all of them together. A single Restore would
 * bring back one older table beside a switch that says the organization lives in the new system
 * (the store refuses it). An ordinary archived item still offers Restore.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { TrashList } from "../components/TrashList";

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test org)
const moved = {
  artifact_kind: "dataset",
  entity_token: "dataset",
  label: "Older table (moved to the new system)",
  id: "b00bde4d-1adc-4682-88eb-57453aabf014",
  title: "Hygiene Recall Schedule",
  deleted_at: "2026-09-26T13:18:00Z",
  organization_id: ORG,
  is_mine: true,
  owner_id: "87a6e699-3622-4869-8843-d0867456c0dd",
  owner_label: "admin@admin.com",
};
const rulebook = {
  ...moved,
  artifact_kind: "rulebook",
  entity_token: "rulebook",
  label: "Rulebook",
  id: "22222222-2222-4222-8222-222222222222",
  title: "Infection-control rulebook",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "org_trash_counts") return { data: [], error: null };
    if (fn === "org_trash_list") return { data: args.p_offset === 0 ? [moved, rulebook] : [], error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("a moved older table says it moved and offers Switch back, never a single Restore", async () => {
  await act(async () => {
    root.render(<TrashList scope={{ mode: "organization", organizationId: ORG, members: [] }} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const rows = [...container.querySelectorAll("li")];
  const movedRow = rows.find((li) => li.textContent?.includes("Hygiene Recall Schedule"));
  const otherRow = rows.find((li) => li.textContent?.includes("Infection-control rulebook"));
  expect(movedRow).toBeTruthy();
  expect(movedRow!.textContent).toContain("Older table (moved to the new system)");
  expect(movedRow!.textContent).toContain("Switch back restores all of them together");
  expect(movedRow!.textContent).not.toContain("Restore");
  const link = movedRow!.querySelector('a[data-testid="moved-older-table-switch-back"]');
  expect(link?.getAttribute("href")).toBe(`/organizations/${ORG}/settings#data`);

  // An ordinary archived item is untouched.
  expect(otherRow!.textContent).toContain("Restore");
});
