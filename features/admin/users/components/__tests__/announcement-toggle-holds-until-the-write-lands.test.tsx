/**
 * @jest-environment jsdom
 *
 * GATES-TAIL-2. An announcement's Activate/Deactivate control gave no sign a write was in
 * flight (a second click sent a second write) and a refusal toasted the server action's raw
 * text ("Failed" or the database's line). Rule: pending until the write answers; a refusal
 * is said in words with a remedy.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("../AdminUserRef", () => ({ AdminUserRef: () => null }));
jest.mock("../CreateAnnouncementDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/layout/SystemAnnouncementBanner", () => ({ __esModule: true, default: () => null }));
jest.mock("../announcement-menu-section", () => ({ buildAnnouncementMenuSection: () => ({}) }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: (p: { children: React.ReactNode }) => <>{p.children}</>,
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (p: { data: Array<{ id: string }>; rowActions: (r: unknown) => React.ReactNode }) => (
    <div>{p.data.map((r) => <div key={r.id} data-row-id={r.id}>{p.rowActions(r)}</div>)}</div>
  ),
}));
const getAllAnnouncements = jest.fn();
const updateAnnouncement = jest.fn();
jest.mock("@/actions/feedback.actions", () => ({
  getAllAnnouncements: (...a: unknown[]) => getAllAnnouncements(...a),
  updateAnnouncement: (...a: unknown[]) => updateAnnouncement(...a),
  deleteAnnouncement: jest.fn(),
}));

import { AnnouncementsTableClient } from "../AnnouncementsTableClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const ROW = {
  id: "5a0e1b2c-0000-4000-8000-0000000000a1",
  title: "Scheduled maintenance Sunday 2–3 AM PT",
  message: "Chat and files will be read-only for up to an hour.",
  announcement_type: "warning",
  is_active: true,
  target_user_id: null,
  created_at: "2026-09-24T18:00:00Z",
  created_by: null,
};

async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<AnnouncementsTableClient />); });
  await flush();
  const power = () => el.querySelector('[data-row-id] button') as HTMLButtonElement;
  return { power, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  jest.resetAllMocks();
  getAllAnnouncements.mockResolvedValue({ success: true, data: [ROW] });
});

it("shows the control busy while the write is in flight and sends one write for a double click", async () => {
  let answer!: (v: unknown) => void;
  updateAnnouncement.mockImplementation(() => new Promise((r) => { answer = r; }));
  const v = await mount();
  expect(v.power().getAttribute("title")).toBe("Deactivate");
  await act(async () => { v.power().click(); v.power().click(); });
  await flush();
  expect(v.power().disabled).toBe(true);
  expect(v.power().getAttribute("aria-busy")).toBe("true");
  expect(v.power().getAttribute("title")).toBe("Deactivating…");
  expect(updateAnnouncement).toHaveBeenCalledTimes(1);
  await act(async () => { answer({ success: true, data: { ...ROW, is_active: false } }); });
  await flush();
  expect(v.power().getAttribute("title")).toBe("Activate");
  v.unmount();
});

it("a refusal leaves it as it was and says so in words", async () => {
  updateAnnouncement.mockResolvedValue({
    success: false,
    error: "JSON object requested, multiple (or no) rows returned",
  });
  const v = await mount();
  await act(async () => { v.power().click(); });
  await flush();
  expect(v.power().getAttribute("title")).toBe("Deactivate");
  const [title, opts] = toastError.mock.calls[0] as [string, { description?: string } | undefined];
  const said = `${title} ${opts?.description ?? ""}`;
  expect(said).toMatch(/^Could not deactivate/);
  expect(said).not.toMatch(/JSON object|rows returned|^Failed/);
  v.unmount();
});
