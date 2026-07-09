"use client";

import React, { useState } from "react";
import { FolderPlus, RefreshCw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  loadCodeFilesList,
  loadCodeFolders,
} from "@/features/code-files/redux/thunks";
import { selectCodeFilesListStatus } from "@/features/code-files/redux/selectors";
import { cn } from "@/lib/utils";
import { SidePanelHeader, SidePanelAction } from "../SidePanelChrome";
import { LibraryTree } from "./LibraryTree";

interface LibraryPanelProps {
  className?: string;
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
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    dispatch(loadCodeFilesList());
    dispatch(loadCodeFolders());
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Code"
        actions={
          <>
            <SidePanelAction
              icon={FolderPlus}
              label="New Folder"
              onClick={() => undefined}
            />
            <SidePanelAction
              icon={RefreshCw}
              label={listStatus === "loading" ? "Refreshing…" : "Refresh"}
              onClick={refresh}
            />
          </>
        }
      />
      <LibraryTree refreshKey={refreshKey} />
    </div>
  );
};
