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
  resourceKey?: string | null;
  linkedFileId?: string | null;
}>;

export const ALL_ACCESSIBLE_DRIVE: DriveBrowseCriteria = {
  search: "",
  folderId: null,
  folderName: null,
};

/** Reset both the applied request criteria and its visible search draft. */
export function allAccessibleDriveBrowseState() {
  return { criteria: ALL_ACCESSIBLE_DRIVE, search: "" };
}

/** A folder browse is independent of the prior root-level name search. */
export function folderDriveBrowseCriteria(
  folderId: string,
  folderName: string,
  resourceKey: string | null = null,
): DriveBrowseCriteria {
  return { search: "", folderId, folderName, resourceKey };
}

const DRIVE_ID = /^[A-Za-z0-9_-]{1,512}$/;
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|(?:drive|docs)\.google\.com(?:[\/:?#]|$))/i;

export type DriveSearchSubmission =
  | { kind: "name"; search: string }
  | { kind: "link"; fileId: string; resourceKey: string | null }
  | { kind: "invalid"; message: string };

/** Parse only known Google Drive links. Never send an arbitrary URL as a name query. */
export function parseDriveSearchSubmission(draft: string): DriveSearchSubmission {
  const value = draft.trim();
  if (!URL_LIKE.test(value)) {
    return value.length <= 200
      ? { kind: "name", search: value }
      : { kind: "invalid", message: "Search names must be 200 characters or fewer." };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "invalid", message: "Enter a valid Google Drive link." };
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["drive.google.com", "docs.google.com"].includes(url.hostname)) {
    return { kind: "invalid", message: "Enter a Google Drive, Docs, Sheets, or Slides link." };
  }
  const path = url.pathname;
  const patterns = url.hostname === "drive.google.com"
    ? [/^\/file\/d\/([^/]+)(?:\/.*)?$/, /^\/(?:drive\/(?:u\/\d+\/)?|)folders\/([^/]+)(?:\/.*)?$/]
    : [/^\/document\/d\/([^/]+)(?:\/.*)?$/, /^\/spreadsheets\/d\/([^/]+)(?:\/.*)?$/, /^\/presentation\/d\/([^/]+)(?:\/.*)?$/];
  const pathId = patterns.map((pattern) => path.match(pattern)?.[1]).find(Boolean);
  const ids = url.searchParams.getAll("id");
  const keys = url.searchParams.getAll("resourcekey");
  const id = path === "/open" ? ids[0] : pathId;
  if (!id || !DRIVE_ID.test(id) || ids.some((other) => other !== id) ||
      (ids.length > 0 && path !== "/open" && ids[0] !== id) ||
      keys.some((key) => !DRIVE_ID.test(key) || key !== keys[0])) {
    return { kind: "invalid", message: "This Google Drive link has an invalid file ID or resource key." };
  }
  if (path === "/open" && (url.hostname !== "drive.google.com" || ids.length !== 1)) {
    return { kind: "invalid", message: "Enter a supported Google Drive file or folder link." };
  }
  return { kind: "link", fileId: id, resourceKey: keys[0] ?? null };
}

export function driveFileResourceKey(
  file: DriveBrowsePage["files"][number],
  criteria: DriveBrowseCriteria,
): string | null {
  if ("resource_key" in file && typeof file.resource_key === "string") return file.resource_key;
  return criteria.linkedFileId === file.id ? criteria.resourceKey ?? null : null;
}

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
    resourceKey: criteria.folderId ? criteria.resourceKey ?? null : null,
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
export type GoogleDriveBlankTab = {
  close: () => void;
  location: { replace: (url: string) => void };
  opener: unknown;
};

/**
 * Claim a blank tab synchronously in the click gesture, then sever its opener
 * before any provider URL is assigned. This preserves browser popup activation
 * without allowing a stale browse-page link to navigate it.
 */
export function openGoogleDriveBlankTab(
  openBlank: (url: string, target: string) => GoogleDriveBlankTab | null,
): GoogleDriveBlankTab | null {
  const tab = openBlank("about:blank", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

/**
 * Navigate a click-owned blank tab only with the provider's fresh metadata
 * link from a same-connection access check. Close it on every refusal.
 */
export async function openFreshGoogleDriveFile(input: {
  check: () => Promise<DriveFileMetadata>;
  selectedConnectionId: string;
  expectedFileId?: string;
  isCurrent?: () => boolean;
  tab: GoogleDriveBlankTab;
}): Promise<void> {
  try {
    const checked = await input.check();
    const link = checked.file.web_view_link;
    if (
      (input.isCurrent && !input.isCurrent()) ||
      !checked.accessible ||
      checked.connection_id !== input.selectedConnectionId ||
      (input.expectedFileId && checked.file.id !== input.expectedFileId) ||
      typeof link !== "string" ||
      !link
    ) {
      throw new Error(
        "Google Drive could not confirm a current link for this file.",
      );
    }
    input.tab.location.replace(link);
  } catch (caught) {
    input.tab.close();
    throw caught;
  }
}

export function incompleteSearchNotice(
  page: DriveBrowsePage | null,
): string | null {
  return page?.incomplete_search
    ? "Google marked this result incomplete. Refine the search before relying on it as a complete list."
    : null;
}
