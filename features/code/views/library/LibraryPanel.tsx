"use client";

import React, { useState } from "react";
import { FilePlus, RefreshCw } from "lucide-react";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  createCodeFileThunk,
  loadCodeFilesList,
  loadCodeFolders,
} from "@/features/code-files/redux/thunks";
import { selectCodeFilesListStatus } from "@/features/code-files/redux/selectors";
import { cn } from "@/lib/utils";
import { useOpenLibraryFile } from "../../hooks/useOpenLibraryFile";
import { languageFromFilename } from "../../styles/file-icon";
import { SidePanelHeader, SidePanelAction } from "../SidePanelChrome";
import { LibraryTree } from "./LibraryTree";

interface LibraryPanelProps {
  className?: string;
}

interface CreateFileTarget {
  folderId: string | null;
  label: string;
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
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    dispatch(loadCodeFilesList());
    dispatch(loadCodeFolders());
    setRefreshKey((k) => k + 1);
  };

  const requestCreateFile = (folderId: string | null, label: string) => {
    setCreateTarget({ folderId, label });
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
        <LibraryTree refreshKey={refreshKey} onCreateFile={requestCreateFile} />
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
    </>
  );
};
