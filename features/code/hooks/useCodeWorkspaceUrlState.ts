"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { SandboxInstance, SandboxListResponse } from "@/types/sandbox";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { useOpenFile } from "./useOpenFile";
import {
  revealView,
  selectActiveFilesystemId,
  selectActiveSandboxId,
  selectActiveView,
  selectExplorerRootOverride,
  selectFarRightOpen,
  selectRightOpen,
  selectSideOpen,
  setExplorerRootOverride,
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
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);
  const bottomOpen = useAppSelector(selectTerminalOpen);
  const bottomTab = useAppSelector(selectTerminalActiveTab);
  const activeTab = useAppSelector(selectActiveTab);
  const [locationSearch, setLocationSearch] = useState(
    () => params?.toString() ?? "",
  );
  const restoringSearchRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const appliedLocationRef = useRef<string | null>(null);
  const initialSandboxRef = useRef(initialSandboxId);
  const hasNormalizedRef = useRef(false);
  const fileRestoreAbortRef = useRef<AbortController | null>(null);

  const { connect, disconnect } = useSandboxWorkspaceConnection({
    // URL restoration must remain honest without replacing the workspace with
    // an error screen. The Sandboxes panel remains the actionable recovery
    // surface for an unavailable instance.
    onError: (message) => console.error("[code URL restore]", message),
  });

  const applyNonFilesystemState = useCallback(
    (state: CodeWorkspaceUrlState) => {
      if (state.activeView) dispatch(revealView(state.activeView));
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
    const onPopState = () => setLocationSearch(window.location.search.slice(1));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const targetSearch = locationSearch;
    if (appliedLocationRef.current === targetSearch) return;
    const state = parseCodeWorkspaceUrlState(new URLSearchParams(targetSearch));
    restoringSearchRef.current = targetSearch;
    fileRestoreAbortRef.current?.abort();
    const generation = ++requestGenerationRef.current;
    applyNonFilesystemState(state);

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
          const connected = await connect(instance, { restore: true });
          if (!connected && generation === requestGenerationRef.current) {
            // `connect` reports a non-runnable sandbox as a handled false
            // result. Finish this restore so later UI changes can still
            // serialize; otherwise the URL bridge would remain paused.
            restoringSearchRef.current = null;
            appliedLocationRef.current = targetSearch;
          }
        } catch (error) {
          if (generation === requestGenerationRef.current) {
            console.error("[code URL restore] sandbox", error);
            restoringSearchRef.current = null;
            appliedLocationRef.current = targetSearch;
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
          appliedLocationRef.current = targetSearch;
          restoringSearchRef.current = null;
          if (state.sandboxId === initialSandboxRef.current) {
            initialSandboxRef.current = null;
          }
        }
      });
      return;
    }
    appliedLocationRef.current = targetSearch;
    restoringSearchRef.current = null;
    if (state.sandboxId && state.sandboxId === initialSandboxRef.current) {
      initialSandboxRef.current = null;
    }
  }, [activeFilesystemId, activeSandboxId, dispatch, filesystem, locationSearch, openFile]);

  // Reflect normal workspace interaction back into the current route without
  // changing history on every panel drag or tab click. `popstate` remains the
  // authority when the user navigates back/forward to a prior route URL.
  useEffect(() => {
    if (restoringSearchRef.current !== null) return;
    const current = new URLSearchParams(window.location.search);
    const filePath = activeTab?.id.startsWith(`${filesystem.id}:`) && activeTab.path.startsWith("/")
      ? activeTab.path
      : null;
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
    });
    const nextSearch = next.toString();
    if (nextSearch === current.toString()) return;
    const href = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    if (hasNormalizedRef.current) {
      window.history.pushState(window.history.state, "", href);
    } else {
      window.history.replaceState(window.history.state, "", href);
      hasNormalizedRef.current = true;
    }
    appliedLocationRef.current = nextSearch;
  }, [
    activeSandboxId,
    activeTab,
    activeView,
    bottomOpen,
    bottomTab,
    explorerRootOverride,
    farRightOpen,
    filesystem.id,
    filesystem.rootPath,
    rightOpen,
    sideOpen,
  ]);
}
