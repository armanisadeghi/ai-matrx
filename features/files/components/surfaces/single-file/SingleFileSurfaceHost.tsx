/**
 * features/files/components/surfaces/single-file/SingleFileSurfaceHost.tsx
 *
 * THE host of the `matrx-user/file` surface (features/surfaces/manifests/
 * file.manifest.ts) for ONE file — used by the single-file page
 * (`SingleFileShell`, `/files/f/[fileId]`) AND by a File tile on a Board
 * (`features/spatial/items/work-items.tsx`, `surface.Host`). One component, two
 * consumers, so an agent can do in a tile exactly what it can do on the page.
 *
 * It owns the viewer state the surface reads and writes — the open tab and the
 * PDF page — and hands it to the body through `useSingleFileView()`. The body
 * (`SingleFileWorkspace`) renders `FileTabsBody` controlled by that state.
 *
 * Every write goes through `useFileActions` — the file feature's one action
 * bundle (Rename dialog, Move picker, Share tab, Versions tab all call it) —
 * after the same guards the Rename dialog applies. Handlers validate and THROW;
 * the writeback / client-tool seams turn a throw into the envelope the agent
 * reads back.
 *
 * Board tiles: the board wraps every tile in `SurfaceActivity`; only the live
 * tile registers, so this host registers unconditionally.
 */

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  SurfaceRuntimeProvider,
  useSurfaceClientTools,
  type SurfaceClientToolHandlers,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  FILE_SURFACE_NAME,
  FILE_SURFACE_TABS,
  FILE_SURFACE_VISIBILITIES,
  createFileScope,
  type FileSurfaceTab,
} from "@/features/surfaces/manifests/file.manifest";
import {
  selectActiveShareLinksForResource,
  selectAllFoldersMap,
  selectFileById,
  selectPermissionsForResource,
  selectRagStatusForFile,
  selectVersionsForFile,
} from "@/features/files/redux/selectors";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import {
  splitNameAndExtension,
  validateRenameInput,
} from "@/features/files/components/core/RenameDialog/RenameDialog";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { lookupFileDocument } from "@/features/files/api/document-lookup";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import type { CloudFileRecord, Visibility } from "@/features/files/types";
import type { FileTab } from "../FileTabsBody";
import {
  assertFilesRenameAllowed,
  siblingNamesInFolder,
} from "../useFilesSurfaceWriteHandlers";

// ── View state shared with the body ─────────────────────────────────────────

export interface SingleFileView {
  fileId: string;
  activeTab: FileTab;
  setActiveTab: (tab: FileTab) => void;
  /** 1-based PDF page; undefined until one is turned or requested. */
  pageNumber: number | undefined;
  setPageNumber: (page: number) => void;
}

const SingleFileViewContext = createContext<SingleFileView | null>(null);

/** The host's view state. Throws outside a host — the body needs one. */
export function useSingleFileView(): SingleFileView {
  const view = useContext(SingleFileViewContext);
  if (!view) {
    throw new Error(
      "useSingleFileView must be used inside <SingleFileSurfaceHost>.",
    );
  }
  return view;
}

function isFileSurfaceTab(value: unknown): value is FileSurfaceTab {
  return (
    typeof value === "string" &&
    (FILE_SURFACE_TABS as readonly string[]).includes(value)
  );
}

function isVisibility(value: unknown): value is Visibility {
  return (
    typeof value === "string" &&
    (FILE_SURFACE_VISIBILITIES as readonly string[]).includes(value)
  );
}

function isVirtualFile(fileId: string, file: CloudFileRecord | undefined): boolean {
  return isSyntheticId(fileId) || file?.source.kind === "virtual";
}

function asObject(input: unknown, tool: string, shape: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${tool} expects an object ${shape}.`);
  }
  return input as Record<string, unknown>;
}

// ── Scope ───────────────────────────────────────────────────────────────────

async function buildScope(
  state: RootState,
  fileId: string,
  activeTab: FileTab,
  pageNumber: number | undefined,
) {
  const file = selectFileById(state, fileId);
  const base = { file_id: fileId, active_tab: activeTab, page_number: pageNumber };
  if (!file) return createFileScope(base);

  const folder = file.parentFolderId
    ? selectAllFoldersMap(state)[file.parentFolderId]
    : undefined;
  const folderPath = file.parentFolderId ? folder?.folderPath : "";
  const previewKind = getPreviewCapability(
    file.fileName,
    file.mimeType,
    file.fileSize,
  ).previewKind;
  const userId = selectUserId(state);
  const isOwner = !!userId && userId === file.ownerId;
  const virtual = isVirtualFile(fileId, file);

  const links = selectActiveShareLinksForResource(state, fileId);
  const grants = selectPermissionsForResource(state, fileId);
  const versions = selectVersionsForFile(state, fileId);
  const knowledgeStatus = selectRagStatusForFile(state, fileId);

  // The file → Knowledge document probe is memoised per session (the
  // Knowledge tab and badges prime it), so this is one query at most.
  let knowledgeDocument: Record<string, unknown> | null | undefined;
  if (!virtual) {
    const doc = await lookupFileDocument(fileId);
    if (doc.kind === "found") {
      knowledgeDocument = {
        processed_document_id: doc.doc.processed_document_id,
        total_pages: doc.doc.total_pages,
        has_clean_content: doc.doc.has_clean_content,
        updated_at: doc.doc.updated_at,
      };
    } else if (doc.kind === "absent") {
      knowledgeDocument = null;
    }
  }

  return createFileScope({
    ...base,
    file_name: file.fileName,
    file_mime_type: file.mimeType ?? undefined,
    file_preview_kind: previewKind,
    file_size_bytes: file.fileSize ?? undefined,
    file_created_at: file.createdAt,
    file_updated_at: file.updatedAt,
    file_is_virtual: virtual,
    file_folder_id: file.parentFolderId ?? null,
    file_folder_path: folderPath,
    file_visibility: file.visibility,
    file_is_owner: isOwner,
    file_current_version: file.currentVersion,
    file_summary: {
      id: fileId,
      name: file.fileName,
      mime_type: file.mimeType,
      preview_kind: previewKind,
      size: file.fileSize,
      folder_id: file.parentFolderId ?? null,
      folder_path: folderPath ?? null,
      visibility: file.visibility,
      is_owner: isOwner,
      current_version: file.currentVersion,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
    },
    file_share_links:
      links.length > 0
        ? links.map((l) => ({
            id: l.id,
            permission_level: l.permissionLevel,
            expires_at: l.expiresAt,
            use_count: l.useCount,
          }))
        : undefined,
    file_grants: grants?.map((g) => ({
      grantee_type: g.granteeType,
      grantee_id: g.granteeId,
      permission_level: g.permissionLevel,
    })),
    file_versions:
      versions.length > 0
        ? versions.map((v) => ({
            version_number: v.versionNumber,
            size: v.fileSize,
            created_at: v.createdAt,
            change_summary: v.changeSummary,
          }))
        : undefined,
    file_knowledge_status: knowledgeStatus,
    file_knowledge_document: knowledgeDocument,
  });
}

// ── Host ────────────────────────────────────────────────────────────────────

export interface SingleFileSurfaceHostProps {
  fileId: string;
  /** Tab to open first (e.g. the page's `?tab=` deep link). */
  initialTab?: FileTab;
  children: ReactNode;
}

export function SingleFileSurfaceHost({
  fileId,
  initialTab,
  children,
}: SingleFileSurfaceHostProps) {
  const store = useAppStore();
  const actions = useFileActions(fileId);
  const [activeTab, setActiveTab] = useState<FileTab>(initialTab ?? "preview");
  const [pageNumber, setPageNumber] = useState<number | undefined>(undefined);

  // Off-tree / deep-link hydration — the same canonical hook FilePreview uses.
  useEnsureCloudFile(fileId);

  const liveFile = () => {
    const state = store.getState();
    const file = selectFileById(state, fileId);
    return { state, file };
  };

  const getWriteHandlers = (): SurfaceWriteHandlers => ({
    file_name: async (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("file_name expects a non-empty string.");
      }
      assertFilesRenameAllowed(store.getState(), "file_name");
      const { state, file } = liveFile();
      if (!file) {
        throw new Error(`file_name refused: file ${fileId} has not loaded yet.`);
      }
      const [, originalExt] = splitNameAndExtension(file.fileName);
      const result = validateRenameInput(value, file.fileName, {
        kind: "file",
        originalExt,
        siblingNames: siblingNamesInFolder(state, file.parentFolderId ?? null, fileId),
      });
      if (result.ok === false) {
        throw new Error(`file_name rejected (${result.code}): ${result.error}`);
      }
      await actions.rename(result.value);
      return { summary: `Renamed "${file.fileName}" to "${result.value}".` };
    },

    file_folder_id: async (value: unknown) => {
      if (value !== null && typeof value !== "string") {
        throw new Error("file_folder_id expects a folder UUID string, or null for the top level.");
      }
      const target = typeof value === "string" && value.trim() ? value.trim() : null;
      const { state, file } = liveFile();
      if (!file) {
        throw new Error(`file_folder_id refused: file ${fileId} has not loaded yet.`);
      }
      if ((file.parentFolderId ?? null) === target) {
        throw new Error("file_folder_id refused: the file is already in that folder.");
      }
      let label = "the top level";
      if (target) {
        const folder = selectAllFoldersMap(state)[target];
        if (!folder || folder.deletedAt) {
          throw new Error(
            `file_folder_id refused: no folder ${target} in the person's files (or it is deleted).`,
          );
        }
        if (folder.source.kind === "virtual" && !isVirtualFile(fileId, file)) {
          throw new Error(
            "file_folder_id refused: that folder belongs to a virtual source; a stored file cannot move into it.",
          );
        }
        label = `"${folder.folderPath || folder.folderName}"`;
      }
      await actions.move(target);
      return { summary: `Moved "${file.fileName}" to ${label}.` };
    },

    file_visibility: async (value: unknown) => {
      if (!isVisibility(value)) {
        throw new Error(
          `file_visibility expects exactly one of: ${FILE_SURFACE_VISIBILITIES.join(", ")}.`,
        );
      }
      const { state, file } = liveFile();
      if (!file) {
        throw new Error(`file_visibility refused: file ${fileId} has not loaded yet.`);
      }
      if (isVirtualFile(fileId, file)) {
        throw new Error(
          "file_visibility refused: this is a virtual-source record; its sharing is managed by the feature that owns it.",
        );
      }
      const userId = selectUserId(state);
      if (!userId || userId !== file.ownerId) {
        throw new Error("file_visibility refused: only the file's owner can change its visibility.");
      }
      if (file.visibility === value) {
        throw new Error(`file_visibility refused: the file is already "${value}".`);
      }
      await actions.setVisibility(value);
      return { summary: `Visibility of "${file.fileName}" set to ${value}.` };
    },

    file_restore_version: async (value: unknown) => {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error("file_restore_version expects a positive integer version_number.");
      }
      const { state, file } = liveFile();
      if (!file) {
        throw new Error(`file_restore_version refused: file ${fileId} has not loaded yet.`);
      }
      if (isVirtualFile(fileId, file)) {
        throw new Error("file_restore_version refused: virtual-source records have no stored versions.");
      }
      if (value >= file.currentVersion) {
        throw new Error(
          `file_restore_version refused: ${value} is not an earlier version (current is ${file.currentVersion}).`,
        );
      }
      const versions = selectVersionsForFile(state, fileId);
      if (versions.length > 0 && !versions.some((v) => v.versionNumber === value)) {
        throw new Error(`file_restore_version refused: version ${value} does not exist.`);
      }
      await actions.restoreVersion(value);
      return { summary: `Restored version ${value} of "${file.fileName}".` };
    },
  });

  const clientTools: SurfaceClientToolHandlers = {
    file_open_tab: (input: unknown) => {
      const { tab } = asObject(input, "file_open_tab", '{ "tab": "<tab>" }');
      if (!isFileSurfaceTab(tab)) {
        throw new Error(`file_open_tab.tab must be one of: ${FILE_SURFACE_TABS.join(", ")}.`);
      }
      setActiveTab(tab);
      return { active_tab: tab };
    },
    file_go_to_page: (input: unknown) => {
      const { page } = asObject(input, "file_go_to_page", '{ "page": <number> }');
      if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
        throw new Error("file_go_to_page.page expects a positive integer.");
      }
      const { file } = liveFile();
      if (!file) {
        throw new Error(`file_go_to_page refused: file ${fileId} has not loaded yet.`);
      }
      const kind = getPreviewCapability(file.fileName, file.mimeType, file.fileSize).previewKind;
      if (kind !== "pdf") {
        throw new Error(`file_go_to_page refused: this file (${kind}) has no pages.`);
      }
      setActiveTab("preview");
      setPageNumber(page);
      return { active_tab: "preview", page_number: page };
    },
    file_download: async () => {
      const { file } = liveFile();
      if (!file) {
        throw new Error(`file_download refused: file ${fileId} has not loaded yet.`);
      }
      if (isVirtualFile(fileId, file)) {
        throw new Error("file_download refused: virtual-source records have no stored bytes to download.");
      }
      await actions.download();
      return { downloaded: file.fileName };
    },
  };
  useSurfaceClientTools(FILE_SURFACE_NAME, clientTools);

  const view: SingleFileView = {
    fileId,
    activeTab,
    setActiveTab,
    pageNumber,
    setPageNumber,
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={FILE_SURFACE_NAME}
      getScope={() => buildScope(store.getState(), fileId, activeTab, pageNumber)}
      getWriteHandlers={getWriteHandlers}
    >
      <SingleFileViewContext.Provider value={view}>
        {children}
      </SingleFileViewContext.Provider>
    </SurfaceRuntimeProvider>
  );
}
