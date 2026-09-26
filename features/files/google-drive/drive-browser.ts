import { getFileTypeDetails } from "@/features/files/utils/file-types";
import type {
  DriveBrowsePage,
  DriveFileMetadata,
} from "@/features/marketing/google/service";

export const DRIVE_BROWSE_FILES_PATH = "/files/google-drive";

export type DriveBrowseCapability = {
  key: string;
  rollout_phase: "available" | "internal_test";
  eligible: boolean;
  limitation?: string;
  remedy?: string;
};

export type DriveBrowseCriteria = Readonly<{
  search: string;
  folderId: string | null;
  folderName: string | null;
}>;

export const ALL_ACCESSIBLE_DRIVE: DriveBrowseCriteria = {
  search: "",
  folderId: null,
  folderName: null,
};

/** The catalog is caller-scoped; a rollout flag alone never admits a Files entry. */
export function driveBrowseIsAvailable(
  capability: DriveBrowseCapability | undefined,
): boolean {
  return Boolean(
    capability?.key === "drive_browse" &&
    capability.rollout_phase === "internal_test" &&
    capability.eligible,
  );
}

export function nextDriveBrowseInput(
  criteria: DriveBrowseCriteria,
  pageToken: string | null = null,
) {
  return {
    search: criteria.search || null,
    folderId: criteria.folderId,
    pageToken,
  };
}

const GOOGLE_FILE_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides presentation",
  "application/vnd.google-apps.drawing": "Google Drawing",
  "application/vnd.google-apps.form": "Google Form",
  "application/vnd.google-apps.folder": "Folder",
};

export function driveFileTypeLabel(
  file: DriveBrowsePage["files"][number],
): string {
  return (
    GOOGLE_FILE_TYPES[file.mime_type] ??
    getFileTypeDetails(file.name).displayName
  );
}

/**
 * Open only the provider's fresh metadata link from a same-connection access
 * check. A browse-page link can have become stale or inaccessible meanwhile.
 */
export async function openFreshGoogleDriveFile(input: {
  check: () => Promise<DriveFileMetadata>;
  selectedConnectionId: string;
  open: (url: string) => void;
}): Promise<void> {
  const checked = await input.check();
  const link = checked.file.web_view_link;
  if (
    !checked.accessible ||
    checked.connection_id !== input.selectedConnectionId ||
    typeof link !== "string" ||
    !link
  ) {
    throw new Error(
      "Google Drive could not confirm a current link for this file.",
    );
  }
  input.open(link);
}

export function incompleteSearchNotice(
  page: DriveBrowsePage | null,
): string | null {
  return page?.incomplete_search
    ? "Google marked this result incomplete. Refine the search before relying on it as a complete list."
    : null;
}
