import type {
  DriveBrowsePage,
  DriveFileMetadata,
} from "@/features/marketing/google/service";
import {
  ALL_ACCESSIBLE_DRIVE,
  allAccessibleDriveBrowseState,
  DRIVE_BROWSE_FILES_PATH,
  folderDriveBrowseCriteria,
  driveBrowseIsAvailable,
  driveFileTypeLabel,
  incompleteSearchNotice,
  nextDriveBrowseInput,
  openFreshGoogleDriveFile,
  openGoogleDriveBlankTab,
  parseDriveSearchSubmission,
  driveFileResourceKey,
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

  it("clears search when browsing a folder or resetting all accessible files", () => {
    expect(folderDriveBrowseCriteria("folder-1", "Plans")).toEqual({
      search: "",
      folderId: "folder-1",
      folderName: "Plans",
      resourceKey: null,
    });
    expect(allAccessibleDriveBrowseState()).toEqual({
      criteria: ALL_ACCESSIBLE_DRIVE,
      search: "",
    });
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
      resourceKey: null,
    });
    expect(nextDriveBrowseInput(ALL_ACCESSIBLE_DRIVE)).toEqual({
      search: null,
      folderId: null,
      pageToken: null,
      resourceKey: null,
    });
  });

  it.each([
    ["https://docs.google.com/document/d/doc_1/edit?resourcekey=key-1", "doc_1", "key-1"],
    ["https://docs.google.com/spreadsheets/d/sheet_2/edit", "sheet_2", null],
    ["https://docs.google.com/presentation/d/slides_3/edit", "slides_3", null],
    ["https://drive.google.com/file/d/file_4/view", "file_4", null],
    ["https://drive.google.com/drive/u/0/folders/folder_5?resourcekey=folder-key", "folder_5", "folder-key"],
    ["https://drive.google.com/open?id=open_6", "open_6", null],
  ])("recognizes a supported Google link %s", (url, fileId, resourceKey) => {
    expect(parseDriveSearchSubmission(url)).toEqual({ kind: "link", fileId, resourceKey });
  });

  it.each([
    "http://drive.google.com/file/d/file/view",
    "https://drive.google.com:8443/file/d/file/view",
    "https://user@drive.google.com/file/d/file/view",
    "https://drive.google.com.evil.test/file/d/file/view",
    "https://drive.google.com/open?id=one&id=two",
    "https://drive.google.com/file/d/one/view?id=two",
    "https://drive.google.com/open?id=one&resourcekey=a&resourcekey=b",
    "https://docs.google.com/forms/d/one/edit",
    "drive.google.com/file/d/one/view",
  ])("rejects unsupported or malformed link %s", (url) => {
    expect(parseDriveSearchSubmission(url).kind).toBe("invalid");
  });

  it("keeps filename search bounded and a linked key on its exact file only", () => {
    expect(parseDriveSearchSubmission("  Plan  ")).toEqual({ kind: "name", search: "Plan" });
    expect(parseDriveSearchSubmission("x".repeat(201)).kind).toBe("invalid");
    const linked = { search: "", folderId: null, folderName: null, linkedFileId: "file-1", resourceKey: "link-key" };
    expect(driveFileResourceKey(file, linked)).toBe("link-key");
    expect(driveFileResourceKey({ ...file, id: "child" }, linked)).toBeNull();
    const keyedFile = { ...file, resource_key: "own-key" };
    expect(driveFileResourceKey(keyedFile, linked)).toBe("own-key");
    expect(nextDriveBrowseInput(folderDriveBrowseCriteria("folder", "Folder", "folder-key"), "next")).toEqual({
      search: null, folderId: "folder", pageToken: "next", resourceKey: "folder-key",
    });
  });

  function blankTab() {
    return {
      close: jest.fn(),
      location: { replace: jest.fn() },
      opener: { parent: true },
    };
  }

  it("claims a blank popup in the click gesture and removes its opener", () => {
    const tab = blankTab();
    const openBlank = jest.fn(() => tab);
    expect(openGoogleDriveBlankTab(openBlank)).toBe(tab);
    expect(openBlank).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
  });

  it.each(["403 forbidden", "404 not found"])(
    "does not open a stale listing link when the fresh access check returns %s",
    async (response) => {
      const tab = blankTab();
      await expect(
        openFreshGoogleDriveFile({
          selectedConnectionId: "connection-1",
          check: async () => {
            throw new Error(response);
          },
          tab,
        }),
      ).rejects.toThrow(response);
      expect(tab.location.replace).not.toHaveBeenCalled();
      expect(tab.close).toHaveBeenCalledTimes(1);
    },
  );

  it("closes the blank tab when a current link is returned for another connection", async () => {
    const tab = blankTab();
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
        tab,
      }),
    ).rejects.toThrow("could not confirm a current link");
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(tab.close).toHaveBeenCalledTimes(1);
  });

  it("closes a pending open when the selection changes before metadata returns", async () => {
    const tab = blankTab();
    let current = true;
    await expect(openFreshGoogleDriveFile({
      selectedConnectionId: "connection-1",
      expectedFileId: "file-1",
      isCurrent: () => current,
      check: async () => {
        current = false;
        return { connection_id: "connection-1", source_account: "reviewer@example.com",
          source_owner_type: "user", source_owner_id: "user-1", file, accessible: true };
      },
      tab,
    })).rejects.toThrow("could not confirm a current link");
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(tab.close).toHaveBeenCalledTimes(1);
  });

  it("opens only a current accessible link from the same connection", async () => {
    const tab = blankTab();
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
      tab,
    });
    expect(tab.location.replace).toHaveBeenCalledWith(file.web_view_link);
    expect(tab.close).not.toHaveBeenCalled();
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
