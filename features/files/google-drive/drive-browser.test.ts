import type {
  DriveBrowsePage,
  DriveFileMetadata,
} from "@/features/marketing/google/service";
import {
  ALL_ACCESSIBLE_DRIVE,
  DRIVE_BROWSE_FILES_PATH,
  driveBrowseIsAvailable,
  driveFileTypeLabel,
  incompleteSearchNotice,
  nextDriveBrowseInput,
  openFreshGoogleDriveFile,
} from "./drive-browser";

const file = {
  id: "file-1",
  name: "Quarterly plan",
  mime_type: "application/vnd.google-apps.document",
  modified_at: "2026-09-26T12:00:00Z",
  web_view_link: "https://docs.google.com/document/d/file-1",
  owners: [],
  shared_drive: false,
};

describe("restricted Drive browser", () => {
  it("shows its Files entry only for the caller admitted by the internal-test capability", () => {
    expect(
      driveBrowseIsAvailable({
        key: "drive_browse",
        rollout_phase: "internal_test",
        eligible: true,
      }),
    ).toBe(true);
    expect(
      driveBrowseIsAvailable({
        key: "drive_browse",
        rollout_phase: "internal_test",
        eligible: false,
      }),
    ).toBe(false);
    expect(DRIVE_BROWSE_FILES_PATH).toBe("/files/google-drive");
  });

  it("binds a next token to applied criteria, never the edited search draft", () => {
    const applied = {
      search: "budget",
      folderId: "folder-1",
      folderName: "Plans",
    };
    expect(nextDriveBrowseInput(applied, "opaque-next")).toEqual({
      search: "budget",
      folderId: "folder-1",
      pageToken: "opaque-next",
    });
    expect(nextDriveBrowseInput(ALL_ACCESSIBLE_DRIVE)).toEqual({
      search: null,
      folderId: null,
      pageToken: null,
    });
  });

  it.each(["403 forbidden", "404 not found"])(
    "does not open a stale listing link when the fresh access check returns %s",
    async (response) => {
      const open = jest.fn();
      await expect(
        openFreshGoogleDriveFile({
          selectedConnectionId: "connection-1",
          check: async () => {
            throw new Error(response);
          },
          open,
        }),
      ).rejects.toThrow(response);
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("does not open a current link returned for another connection", async () => {
    const open = jest.fn();
    await expect(
      openFreshGoogleDriveFile({
        selectedConnectionId: "connection-1",
        check: async () => ({
          connection_id: "connection-2",
          source_account: "other@example.com",
          source_owner_type: "user",
          source_owner_id: "user-2",
          file,
          accessible: true,
        }),
        open,
      }),
    ).rejects.toThrow("could not confirm a current link");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens only a current accessible link from the same connection", async () => {
    const open = jest.fn();
    const metadata: DriveFileMetadata = {
      connection_id: "connection-1",
      source_account: "reviewer@example.com",
      source_owner_type: "user",
      source_owner_id: "user-1",
      file,
      accessible: true,
    };
    await openFreshGoogleDriveFile({
      selectedConnectionId: "connection-1",
      check: async () => metadata,
      open,
    });
    expect(open).toHaveBeenCalledWith(file.web_view_link);
  });

  it("keeps incomplete-search truth visible and names Google-native file types", () => {
    const page: DriveBrowsePage = {
      connection_id: "connection-1",
      source_account: "reviewer@example.com",
      source_owner_type: "user",
      source_owner_id: "user-1",
      files: [file],
      next_page_token: null,
      incomplete_search: true,
    };
    expect(incompleteSearchNotice(page)).toContain("incomplete");
    expect(driveFileTypeLabel(file)).toBe("Google Doc");
  });
});
