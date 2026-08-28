"use client";

import React, { useState } from "react";
import { FilePlus, RefreshCw } from "lucide-react";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  createCodeFileThunk,
  createCodeFolderThunk,
  deleteCodeFileThunk,
  deleteCodeFolderThunk,
  loadCodeFileFull,
  loadCodeFilesList,
  loadCodeFolders,
  saveFileNow,
  updateCodeFolderThunk,
} from "@/features/code-files/redux/thunks";
import { codeFilesActions } from "@/features/code-files/redux/slice";
import { selectCodeFilesListStatus } from "@/features/code-files/redux/selectors";
import { cn } from "@/lib/utils";
import { useOpenLibraryFile } from "../../hooks/useOpenLibraryFile";
import { libraryTabId } from "../../hooks/useOpenLibraryFile";
import { closeTab, renameTab } from "../../redux/tabsSlice";
import { languageFromFilename } from "../../styles/file-icon";
import { SidePanelHeader, SidePanelAction } from "../SidePanelChrome";
import { LibraryTree } from "./LibraryTree";
import type {
  LibraryActionTarget,
  LibraryTreeActions,
} from "./LibraryTreeNode";

interface LibraryPanelProps {
  className?: string;
}

interface CreateFileTarget {
  folderId: string | null;
  label: string;
}

interface CreateFolderTarget {
  parentFolderId: string | null;
  label: string;
}

function renamedPath(path: string, nextName: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1
    ? nextName
    : `${path.slice(0, separator + 1)}${nextName}`;
}

/**
 * Side-panel view that surfaces the user's saved code — `code_files` +
 * `code_folders` — in a tree. Clicking a file opens it in the main Monaco
 * tabs. Writes round-trip through `saveFileNow` (see useSaveActiveTab).
 *
 * This is the primary integration point between ad-hoc code-generating
 * surfaces (chat code blocks, HTML preview modal) and the code editor: any
 * caller that saves a `code_files` row automatically surfaces here.
 */
export const LibraryPanel: React.FC<LibraryPanelProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const listStatus = useAppSelector(selectCodeFilesListStatus);
  const openFile = useOpenLibraryFile();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createTarget, setCreateTarget] = useState<CreateFileTarget | null>(
    null,
  );
  const [createFolderTarget, setCreateFolderTarget] =
    useState<CreateFolderTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<LibraryActionTarget | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<LibraryActionTarget | null>(
    null,
  );
  const [propertiesTarget, setPropertiesTarget] =
    useState<LibraryActionTarget | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const refresh = () => {
    dispatch(loadCodeFilesList());
    dispatch(loadCodeFolders());
    setRefreshKey((k) => k + 1);
  };

  const requestCreateFile = (folderId: string | null, label: string) => {
    setCreateTarget({ folderId, label });
  };

  const requestCreateFolder = (
    parentFolderId: string | null,
    label: string,
  ) => {
    setCreateFolderTarget({ parentFolderId, label });
  };

  const createFile = async (name: string) => {
    if (!createTarget) return;
    setCreating(true);
    try {
      const codeFile = await dispatch(
        createCodeFileThunk({
          name,
          language: languageFromFilename(name),
          content: "",
          folder_id: createTarget.folderId,
        }),
      ).unwrap();
      setCreateTarget(null);
      toast.success(`Created ${name}`);
      try {
        await openFile(codeFile.id);
      } catch (error) {
        toast.error(
          `Created ${name}, but couldn't open it: ${extractErrorMessage(error)}`,
        );
      }
    } catch (error) {
      toast.error(`Create failed: ${extractErrorMessage(error)}`);
    } finally {
      setCreating(false);
    }
  };

  const createFolder = async (name: string) => {
    if (!createFolderTarget) return;
    setActionBusy(true);
    try {
      await dispatch(
        createCodeFolderThunk({
          name,
          parent_folder_id: createFolderTarget.parentFolderId,
        }),
      ).unwrap();
      setCreateFolderTarget(null);
      toast.success(`Created ${name}`);
    } catch (error) {
      toast.error(`Create failed: ${extractErrorMessage(error)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const renameLibraryTarget = async (name: string) => {
    if (!renameTarget) return;
    setActionBusy(true);
    try {
      if (renameTarget.kind === "folder") {
        await dispatch(
          updateCodeFolderThunk({
            id: renameTarget.item.id,
            updates: { name },
          }),
        ).unwrap();
      } else {
        const id = renameTarget.item.id;
        await dispatch(loadCodeFileFull({ id })).unwrap();
        const language = languageFromFilename(name);
        dispatch(codeFilesActions.setLocalName({ id, name }));
        dispatch(codeFilesActions.setLocalLanguage({ id, language }));
        await dispatch(saveFileNow({ id })).unwrap();
        dispatch(
          renameTab({
            id: libraryTabId(id),
            name,
            path: renamedPath(renameTarget.path, name),
            language,
          }),
        );
      }
      toast.success(`Renamed to ${name}`);
      setRenameTarget(null);
    } catch (error) {
      toast.error(`Rename failed: ${extractErrorMessage(error)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const deleteLibraryTarget = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      if (deleteTarget.kind === "folder") {
        await dispatch(deleteCodeFolderThunk(deleteTarget.item.id)).unwrap();
      } else {
        await dispatch(deleteCodeFileThunk(deleteTarget.item.id)).unwrap();
        dispatch(closeTab(libraryTabId(deleteTarget.item.id)));
      }
      toast.success(`Deleted ${deleteTarget.item.name}`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(`Delete failed: ${extractErrorMessage(error)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const copyPath = (path: string) => {
    void navigator.clipboard
      .writeText(path)
      .then(() => toast.success("Path copied"))
      .catch(() => toast.error("Clipboard blocked"));
  };

  const treeActions: LibraryTreeActions = {
    onCreateFolder: requestCreateFolder,
    onRename: setRenameTarget,
    onDelete: setDeleteTarget,
    onProperties: setPropertiesTarget,
    onCopyPath: copyPath,
    onRefresh: refresh,
  };

  return (
    <>
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <SidePanelHeader
          title="Code"
          actions={
            <>
              <SidePanelAction
                icon={FilePlus}
                label="New Code File"
                onClick={() => requestCreateFile(null, "My Files")}
              />
              <SidePanelAction
                icon={RefreshCw}
                label={listStatus === "loading" ? "Refreshing…" : "Refresh"}
                onClick={refresh}
              />
            </>
          }
        />
        <LibraryTree
          refreshKey={refreshKey}
          onCreateFile={requestCreateFile}
          actions={treeActions}
        />
      </div>
      <TextInputDialog
        open={createTarget !== null}
        onOpenChange={(open) => {
          if (!open && !creating) setCreateTarget(null);
        }}
        title="New code file"
        description={
          createTarget
            ? `Create in ${createTarget.label}. Enter any filename; its extension selects the editor language, and unknown extensions open as plain text.`
            : undefined
        }
        placeholder="Filename, for example component.tsx"
        defaultValue="untitled.txt"
        confirmLabel="Create"
        busy={creating}
        validate={(value) =>
          value.includes("/") || value.includes("\\")
            ? "Enter a filename, not a path."
            : null
        }
        onConfirm={createFile}
      />
      <TextInputDialog
        open={createFolderTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setCreateFolderTarget(null);
        }}
        title="New folder"
        description={
          createFolderTarget
            ? `Create a folder in ${createFolderTarget.label}.`
            : undefined
        }
        placeholder="Folder name"
        defaultValue="new-folder"
        confirmLabel="Create"
        busy={actionBusy}
        validate={(value) =>
          value.includes("/") || value.includes("\\")
            ? "Enter a folder name, not a path."
            : null
        }
        onConfirm={createFolder}
      />
      <TextInputDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRenameTarget(null);
        }}
        title={`Rename ${renameTarget?.kind ?? "item"}`}
        description={renameTarget ? renameTarget.path : undefined}
        defaultValue={renameTarget?.item.name ?? ""}
        confirmLabel="Rename"
        busy={actionBusy}
        validate={(value) =>
          value.includes("/") || value.includes("\\")
            ? "Enter a name, not a path."
            : null
        }
        onConfirm={renameLibraryTarget}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.kind ?? "item"}`}
        description={
          deleteTarget ? (
            <>
              Permanently delete <strong>{deleteTarget.item.name}</strong>
              {deleteTarget.kind === "folder"
                ? " and everything inside it"
                : ""}
              ? This cannot be undone.
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={actionBusy}
        onConfirm={deleteLibraryTarget}
      />
      <ConfirmDialog
        open={propertiesTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPropertiesTarget(null);
        }}
        title={`${propertiesTarget?.item.name ?? "Item"} properties`}
        content={
          propertiesTarget ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>{propertiesTarget.kind}</dd>
              <dt className="text-muted-foreground">Path</dt>
              <dd className="break-all font-mono">{propertiesTarget.path}</dd>
              <dt className="text-muted-foreground">Visibility</dt>
              <dd>{propertiesTarget.item.visibility}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>
                {new Date(propertiesTarget.item.updated_at).toLocaleString()}
              </dd>
            </dl>
          ) : null
        }
        confirmLabel="Close"
        cancelLabel={null}
        onConfirm={() => setPropertiesTarget(null)}
      />
    </>
  );
};
