"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { SandboxInstance, SandboxListResponse } from "@/types/sandbox";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { useOpenFile } from "./useOpenFile";
import { codeFileIdFromTabId, isLibraryTabId } from "./useOpenLibraryFile";
import { toast } from "@/lib/toast";
import {
  revealView,
  selectActiveFilesystemId,
  selectActiveSandboxId,
  selectActiveView,
  selectExplorerRootOverride,
  selectExplorerSandboxMode,
  selectFarRightOpen,
  selectRightOpen,
  selectSideOpen,
  setExplorerRootOverride,
  setExplorerSandboxMode,
  setFarRightOpen,
  setRightOpen,
  setSideOpen,
} from "../redux/codeWorkspaceSlice";
import {
  selectActiveTab,
} from "../redux/tabsSlice";
import {
  selectTerminalActiveTab,
  selectTerminalOpen,
  setActiveTab as setBottomActiveTab,
  setOpen as setBottomOpen,
} from "../redux/terminalSlice";
import { useSandboxWorkspaceConnection } from "../views/sandboxes/useSandboxWorkspaceConnection";
import {
  parseCodeWorkspaceUrlState,
  resolveCodeWorkspaceUrlView,
  resolveCodeWorkspaceExplorerSandboxMode,
  withCodeWorkspaceUrlState,
  type CodeWorkspaceUrlState,
} from "../url-state";

/**
 * Bidirectional, route-only state for `/code`. The URL stores location and
 * panel choices, never editor contents. Restore is deliberately sequenced:
 * sandbox first, then its root/file, so a stale adapter can never open a path
 * in the previously selected sandbox.
 */
export function useCodeWorkspaceUrlState(initialSandboxId: string | null = null): void {
  const params = useSearchParams();
  const dispatch = useAppDispatch();
  const { filesystem } = useCodeWorkspace();
  const openFile = useOpenFile();
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const activeFilesystemId = useAppSelector(selectActiveFilesystemId);
  const activeView = useAppSelector(selectActiveView);
  const explorerRootOverride = useAppSelector(selectExplorerRootOverride);
  const explorerSandboxMode = useAppSelector(selectExplorerSandboxMode);
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);
  const bottomOpen = useAppSelector(selectTerminalOpen);
  const bottomTab = useAppSelector(selectTerminalActiveTab);
  const activeTab = useAppSelector(selectActiveTab);
  const [locationSearch, setLocationSearch] = useState(
    () => params?.toString() ?? "",
  );
  const [restoreRevision, setRestoreRevision] = useState(0);
  const restoringSearchRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const appliedLocationRef = useRef<string | null>(null);
  const initialSandboxRef = useRef(initialSandboxId);
  const hasNormalizedRef = useRef(false);
  // `popstate` selects an existing history entry. Any serializer work while
  // applying it may only replace that entry; pushing here destroys Forward.
  const isHistoryNavigationRef = useRef(false);
  const fileRestoreAbortRef = useRef<AbortController | null>(null);

  const { connect, disconnect } = useSandboxWorkspaceConnection({
    // URL restoration must remain honest without replacing the workspace with
    // an error screen. The Sandboxes panel remains the actionable recovery
    // surface for an unavailable instance.
    onError: (message) => toast.error(message),
  });

  const completeRestore = useCallback((search: string) => {
    if (restoringSearchRef.current !== search) return;
    appliedLocationRef.current = search;
    restoringSearchRef.current = null;
    setRestoreRevision((revision) => revision + 1);
  }, []);

  const applyNonFilesystemState = useCallback(
    (state: CodeWorkspaceUrlState, params: URLSearchParams) => {
      const view = resolveCodeWorkspaceUrlView(state, params);
      if (view) dispatch(revealView(view));
      if (state.sandboxId) {
        dispatch(
          setExplorerSandboxMode(
            resolveCodeWorkspaceExplorerSandboxMode(state),
          ),
        );
      }
      if (state.sideOpen !== null) dispatch(setSideOpen(state.sideOpen));
      if (state.rightOpen !== null) dispatch(setRightOpen(state.rightOpen));
      if (state.farRightOpen !== null) dispatch(setFarRightOpen(state.farRightOpen));
      if (state.bottomTab) dispatch(setBottomActiveTab(state.bottomTab));
      if (state.bottomOpen !== null) dispatch(setBottomOpen(state.bottomOpen));
    },
    [dispatch],
  );

  // Next navigation updates `useSearchParams`; direct browser back/forward
  // after our `history.replaceState` needs the native event too.
  useEffect(() => {
    setLocationSearch(params?.toString() ?? "");
  }, [params]);
  useEffect(() => {
    const onPopState = () => {
      isHistoryNavigationRef.current = true;
      setLocationSearch(window.location.search.slice(1));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const targetSearch = locationSearch;
    if (appliedLocationRef.current === targetSearch) return;
    const targetParams = new URLSearchParams(targetSearch);
    const state = parseCodeWorkspaceUrlState(targetParams);
    restoringSearchRef.current = targetSearch;
    fileRestoreAbortRef.current?.abort();
    const generation = ++requestGenerationRef.current;
    applyNonFilesystemState(state, targetParams);

    const restore = async () => {
      if (
        state.sandboxId &&
        state.sandboxId !== activeSandboxId &&
        state.sandboxId !== initialSandboxRef.current
      ) {
        try {
          const response = await fetch("/api/sandbox");
          if (!response.ok) throw new Error(`Failed to list sandboxes (${response.status})`);
          const payload = (await response.json()) as SandboxListResponse;
          const instance = payload.instances?.find(
            (candidate: SandboxInstance) => candidate.id === state.sandboxId,
          );
          if (!instance) throw new Error("The sandbox is unavailable or no longer belongs to you.");
          if (generation !== requestGenerationRef.current) return;
          const connected = await connect(instance, {
            restore: true,
            openSessionReport: !state.filePath,
          });
          if (!connected && generation === requestGenerationRef.current) {
            // `connect` reports a non-runnable sandbox as a handled false
            // result. Finish this restore so later UI changes can still
            // serialize; otherwise the URL bridge would remain paused.
            completeRestore(targetSearch);
          }
        } catch (error) {
          if (generation === requestGenerationRef.current) {
            console.error("[code URL restore] sandbox", error);
            toast.error("This sandbox link could not be restored. Choose another sandbox from Compute.");
            completeRestore(targetSearch);
          }
        }
        return;
      }
      if (!state.sandboxId && activeSandboxId) {
        disconnect();
        return;
      }
      // No adapter change is needed, so the filesystem portion may restore now.
      appliedLocationRef.current = targetSearch;
    };
    void restore();
  }, [
    activeSandboxId,
    applyNonFilesystemState,
    connect,
    completeRestore,
    disconnect,
    locationSearch,
  ]);

  // Apply path state only after the requested sandbox's adapter metadata has
  // reached Redux. This is the cross-sandbox race guard.
  useEffect(() => {
    const targetSearch = locationSearch;
    if (restoringSearchRef.current !== targetSearch) return;
    const state = parseCodeWorkspaceUrlState(new URLSearchParams(targetSearch));
    if (state.sandboxId && activeFilesystemId !== `sandbox:${state.sandboxId}`) return;
    if (!state.sandboxId && activeSandboxId) return;

    dispatch(
      setExplorerRootOverride(
        state.explorerRoot && state.explorerRoot !== filesystem.rootPath
          ? state.explorerRoot
          : null,
      ),
    );
    if (state.filePath) {
      const abortController = new AbortController();
      fileRestoreAbortRef.current = abortController;
      void openFile(state.filePath, abortController.signal).catch((error) => {
        console.error("[code URL restore] file", state.filePath, error);
      }).finally(() => {
        // Do not let the serializer observe an interim auto-opened session
        // report and erase the requested file before its read finishes.
        if (
          !abortController.signal.aborted &&
          restoringSearchRef.current === targetSearch
        ) {
          completeRestore(targetSearch);
          if (state.sandboxId === initialSandboxRef.current) {
            initialSandboxRef.current = null;
          }
        }
      });
      return;
    }
    completeRestore(targetSearch);
    if (state.sandboxId && state.sandboxId === initialSandboxRef.current) {
      initialSandboxRef.current = null;
    }
  }, [activeFilesystemId, activeSandboxId, completeRestore, dispatch, filesystem, locationSearch, openFile]);

  // Reflect normal workspace interaction back into the current route without
  // changing history on every panel drag or tab click. `popstate` remains the
  // authority when the user navigates back/forward to a prior route URL.
  useEffect(() => {
    if (restoringSearchRef.current !== null) return;
    const current = new URLSearchParams(window.location.search);
    const currentSearch = current.toString();
    const libraryFileId = activeTab && isLibraryTabId(activeTab.id)
      ? codeFileIdFromTabId(activeTab.id)
      : null;
    // Session reports predate the filesystem tab identity and use a stable
    // `session-report:<sandbox>` id for deduplication. They are still real
    // absolute filesystem files, so selecting one must produce a restorable
    // `file` link just like an Explorer-opened tab.
    const isFilesystemTab = activeTab?.id.startsWith(`${filesystem.id}:`);
    const isActiveSessionReport = Boolean(
      activeSandboxId && activeTab?.id === `session-report:${activeSandboxId}`,
    );
    const filePath =
      (isFilesystemTab || isActiveSessionReport) && activeTab?.path.startsWith("/")
        ? activeTab.path
        : null;
    if (libraryFileId) {
      current.set("open", libraryFileId);
    } else if (filePath) {
      // A filesystem tab and a library record are distinct sources. Keeping a
      // stale `open`/`folder` would reopen a competing tab on reload.
      current.delete("open");
      current.delete("folder");
    }
    const next = withCodeWorkspaceUrlState(current, {
      sandboxId: activeSandboxId,
      filePath,
      explorerRoot: explorerRootOverride ?? filesystem.rootPath,
      activeView,
      sideOpen,
      rightOpen,
      farRightOpen,
      bottomOpen,
      bottomTab,
      explorerSandboxMode: activeSandboxId ? explorerSandboxMode : null,
    });
    const nextSearch = next.toString();
    if (nextSearch === currentSearch) {
      isHistoryNavigationRef.current = false;
      return;
    }
    const href = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    if (hasNormalizedRef.current && !isHistoryNavigationRef.current) {
      window.history.pushState(window.history.state, "", href);
    } else {
      window.history.replaceState(window.history.state, "", href);
      hasNormalizedRef.current = true;
    }
    isHistoryNavigationRef.current = false;
    appliedLocationRef.current = nextSearch;
    // `history.pushState` does not update Next's search-param hook. Keep the
    // restore authority aligned with the URL we just wrote so a later render
    // cannot replay the previous location over a user-selected tab.
    setLocationSearch(nextSearch);
  }, [
    activeSandboxId,
    activeTab,
    activeView,
    bottomOpen,
    bottomTab,
    explorerRootOverride,
    explorerSandboxMode,
    farRightOpen,
    filesystem.id,
    filesystem.rootPath,
    rightOpen,
    sideOpen,
    restoreRevision,
  ]);
}
