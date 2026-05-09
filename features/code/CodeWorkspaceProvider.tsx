"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { FilesystemAdapter } from "./adapters/FilesystemAdapter";
import type { ProcessAdapter } from "./adapters/ProcessAdapter";
import { MockFilesystemAdapter } from "./adapters/MockFilesystemAdapter";
import { MockProcessAdapter } from "./adapters/SandboxProcessAdapter";
import {
  DEFAULT_WORKSPACE_ID,
  registerWorkspace,
} from "./runtime/workspaceRegistry";
import {
  classifyEditorMode,
  setActiveFilesystem,
} from "./redux/codeWorkspaceSlice";
import { useFlushAIEditHistory } from "./redux/codeEditHistoryFlush";

/** What consumers of the workspace context can read + mutate. */
export interface CodeWorkspaceContextValue {
  /** Stable workspace id — used by agent tools to target this instance. */
  workspaceId: string;
  filesystem: FilesystemAdapter;
  process: ProcessAdapter;
  /** Swap the active adapter at runtime — used by the Sandboxes view. */
  setFilesystem: (adapter: FilesystemAdapter) => void;
  setProcess: (adapter: ProcessAdapter) => void;
  /** Library source id (e.g. `"aga_apps"`) the host wants the Library
   *  panel to auto-expand on first mount. `null` keeps the canonical
   *  /code behaviour (everything collapsed lazily). */
  focusedLibrarySourceId: string | null;
}

const CodeWorkspaceContext = createContext<CodeWorkspaceContextValue | null>(
  null,
);

export interface CodeWorkspaceProviderProps {
  /** Stable workspace id. Defaults to `"default"` — override if you need to
   *  host multiple workspaces in the same page and target them independently
   *  from agent tools. */
  workspaceId?: string;
  /** Initial filesystem adapter. Defaults to the MockFilesystemAdapter. */
  initialFilesystem?: FilesystemAdapter;
  /** Initial process adapter. Defaults to a mock echo adapter. */
  initialProcess?: ProcessAdapter;
  /** Library source id (e.g. `"aga_apps"`) the host wants the Library
   *  panel to auto-expand. Read by the LibraryTree at first paint;
   *  changing later does not force a re-collapse. */
  focusedLibrarySourceId?: string | null;
  children: React.ReactNode;
}

export const CodeWorkspaceProvider: React.FC<CodeWorkspaceProviderProps> = ({
  workspaceId = DEFAULT_WORKSPACE_ID,
  initialFilesystem,
  initialProcess,
  focusedLibrarySourceId = null,
  children,
}) => {
  const store = useAppStore();
  const [filesystem, setFilesystem] = useState<FilesystemAdapter>(
    () => initialFilesystem ?? new MockFilesystemAdapter(),
  );
  const [process, setProcess] = useState<ProcessAdapter>(
    () => initialProcess ?? new MockProcessAdapter(),
  );

  useEffect(() => {
    const unregister = registerWorkspace({
      id: workspaceId,
      filesystem,
      process,
      store,
    });
    return unregister;
  }, [workspaceId, filesystem, process, store]);

  // Mirror the active filesystem's metadata into Redux so non-provider
  // call sites (selectors, thunks, the agent context bridge) can read
  // it without reaching into React context. This is the single hop
  // that makes `selectEditorMode` work as a pure selector.
  useEffect(() => {
    store.dispatch(
      setActiveFilesystem({
        id: filesystem.id,
        label: filesystem.label,
        rootPath: filesystem.rootPath,
        mode: classifyEditorMode(filesystem.id),
      }),
    );
  }, [store, filesystem]);

  // Persistence scheduler for the AI edit-history slice. Lives at the
  // workspace root so a single subscription handles every code tab in
  // the page. Safe no-op when there are no pending writes.
  useFlushAIEditHistory();

  const value = useMemo<CodeWorkspaceContextValue>(
    () => ({
      workspaceId,
      filesystem,
      process,
      setFilesystem,
      setProcess,
      focusedLibrarySourceId,
    }),
    [workspaceId, filesystem, process, focusedLibrarySourceId],
  );

  return (
    <CodeWorkspaceContext.Provider value={value}>
      {children}
    </CodeWorkspaceContext.Provider>
  );
};

export function useCodeWorkspace(): CodeWorkspaceContextValue {
  const ctx = useContext(CodeWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useCodeWorkspace must be used inside <CodeWorkspaceProvider>",
    );
  }
  return ctx;
}
