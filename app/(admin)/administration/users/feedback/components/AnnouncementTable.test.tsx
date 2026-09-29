/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { SystemAnnouncement } from "@/types/feedback.types";
import AnnouncementTable from "./AnnouncementTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<SystemAnnouncement> | null = null;
const getAllAnnouncements = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<SystemAnnouncement>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/actions/feedback.actions", () => ({
  getAllAnnouncements: () => getAllAnnouncements(),
  updateAnnouncement: jest.fn(),
  deleteAnnouncement: jest.fn(),
}));

jest.mock("./EditAnnouncementDialog", () => () => null);
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));

const announcement: SystemAnnouncement = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Planned maintenance",
  message: "The service will be briefly unavailable.",
  announcement_type: "warning",
  min_display_seconds: 10,
  is_active: true,
  created_at: "2026-09-28T00:00:00.000Z",
  updated_at: "2026-09-28T00:00:00.000Z",
  created_by: null,
  target_user_id: null,
};

describe("AnnouncementTable read lifecycle", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.clearAllMocks();
  });

  it("keeps the canonical table mounted through loading and a successful empty read", async () => {
    const deferredRead: {
      resolve?: (value: { success: boolean; data: SystemAnnouncement[] }) => void;
    } = {};
    getAllAnnouncements.mockReturnValueOnce(
      new Promise((resolve) => {
        deferredRead.resolve = resolve;
      }),
    );

    await act(async () => root.render(<AnnouncementTable />));
    expect(tableProps).not.toBeNull();
    expect(tableProps?.isLoading).toBe(true);
    expect(tableProps?.read).toMatchObject({ status: "loading", what: "the announcements" });

    const resolveRead = deferredRead.resolve;
    if (!resolveRead) throw new Error("The initial announcement read did not start");
    await act(async () => resolveRead({ success: true, data: [] }));
    expect(tableProps?.isLoading).toBe(false);
    expect(tableProps?.read).toMatchObject({ status: "ready" });
    expect(tableProps?.emptyState).toMatchObject({ title: "No announcements created yet" });
    expect(tableProps?.toolbar?.titleCount).toBeUndefined();
    expect(tableProps?.toolbar).toMatchObject({
      title: "Announcements",
      search: true,
      searchPlaceholder: "Search announcements…",
      refresh: { label: "Refresh announcements" },
    });
    expect(tableProps?.toolbar?.actions).toBeDefined();
  });

  it("keeps earlier rows and reports a failed refresh through the table read state", async () => {
    getAllAnnouncements
      .mockResolvedValueOnce({ success: true, data: [announcement] })
      .mockResolvedValueOnce({ success: false, error: "Read unavailable" });

    await act(async () => root.render(<AnnouncementTable />));
    expect(tableProps?.data).toEqual([announcement]);

    await act(async () => tableProps?.toolbar?.refresh?.onRefresh());
    expect(tableProps?.data).toEqual([announcement]);
    expect(tableProps?.read).toMatchObject({ status: "error", error: expect.any(Error) });
  });

  it("declares title and message as independent filterable columns", async () => {
    getAllAnnouncements.mockResolvedValueOnce({ success: true, data: [announcement] });

    await act(async () => root.render(<AnnouncementTable />));
    expect(tableProps?.columns.map((column) => [column.id, column.accessorKey, column.filter])).toEqual(
      expect.arrayContaining([
        ["title", "title", "text"],
        ["message", "message", "text"],
      ]),
    );
  });
});
