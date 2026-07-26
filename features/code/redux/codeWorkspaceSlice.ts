import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ActivityViewId } from "../types";

/**
 * Where the editor is currently sourcing files from.
 *
 *   "sandbox" — talking to the orchestrator-managed in-container daemon
 *               (`SandboxFilesystemAdapter`). The Python server lives
 *               INSIDE the container, so AI calls from this surface should
 *               be redirected at the per-conversation level via
 *               `instanceUIState.serverOverrideUrl`.
 *   "cloud"   — talking to a cloud-files / Supabase / DB-backed adapter.
 *               AI calls go to the central server (`selectResolvedBaseUrl`).
 *   "mock"    — the in-memory MockFilesystemAdapter; only mounted in dev.
 */
export type EditorMode = "sandbox" | "cloud" | "mock";

export interface CodeWorkspaceState {
  /** Which activity-bar view is currently selected. */
  activeView: ActivityViewId;
  /** Whether the side panel (file tree / search / etc.) is visible. */
  sideOpen: boolean;
  /** Whether the optional right slot (chat) is visible. */
  rightOpen: boolean;
  /** Whether the optional far-right slot (chat history) is visible. */
  farRightOpen: boolean;
  /** The last instanceId the user selected from the Sandboxes view. */
  activeSandboxId: string | null;
  /**
   * Public proxy URL for the active sandbox's in-container Python server.
   * Mirrored from `SandboxInstance.proxy_url` when the user connects to
   * a sandbox; `null` when disconnected or when the orchestrator hasn't
   * surfaced one yet. Read by `useBindAgentToSandbox` to scope a chat
   * conversation's AI calls to this sandbox.
   */
  activeSandboxProxyUrl: string | null;
  /** Override for the explorer's current root. `null` → use adapter's
   *  `rootPath`. Set by the breadcrumb "navigate into / up" controls and by
   *  direct path input. */
  explorerRootOverride: string | null;
  /**
   * Mirror of the active filesystem adapter. The adapter itself is held in
   * React context (`CodeWorkspaceProvider`) because it isn't serializable,
   * but selectors / thunks / context bridges can't reach into context — so
   * we sync this metadata here on every adapter swap.
   *
   *   - `activeFilesystemId`    — `${kind}:${instanceId}` (e.g.
   *                               `sandbox:abc-123`, `mock:default`).
   *   - `activeFilesystemLabel` — human-friendly label for the picker UI.
   *   - `activeFilesystemRoot`  — `adapter.rootPath` so the agent can
   *                               anchor its `read_file` calls.
   *   - `editorMode`            — derived classification.
   */
  activeFilesystemId: string | null;
  activeFilesystemLabel: string | null;
  activeFilesystemRoot: string | null;
  editorMode: EditorMode;
  /** Bumped when the user explicitly starts a new chat (+). Drives launcher
   *  reminting on fresh routes even when the URL stays on `/code?agentId=…`. */
  freshSessionNonce: number;
}

const initialState: CodeWorkspaceState = {
  activeView: "library",
  sideOpen: true,
  rightOpen: true,
  farRightOpen: false,
  activeSandboxId: null,
  activeSandboxProxyUrl: null,
  explorerRootOverride: null,
  activeFilesystemId: null,
  activeFilesystemLabel: null,
  activeFilesystemRoot: null,
  editorMode: "mock",
  freshSessionNonce: 0,
};

const slice = createSlice({
  name: "codeWorkspace",
  initialState,
  reducers: {
    setActiveView(state, action: PayloadAction<ActivityViewId>) {
      // Toggle behavior: clicking the active icon collapses the side panel.
      // Used by the in-workspace ActivityBar and the shell CodeSidebarMenu.
      if (state.activeView === action.payload && state.sideOpen) {
        state.sideOpen = false;
      } else {
        state.activeView = action.payload;
        state.sideOpen = true;
      }
    },
    setSideOpen(state, action: PayloadAction<boolean>) {
      state.sideOpen = action.payload;
    },
    setRightOpen(state, action: PayloadAction<boolean>) {
      state.rightOpen = action.payload;
    },
    setFarRightOpen(state, action: PayloadAction<boolean>) {
      state.farRightOpen = action.payload;
    },
    setActiveSandboxId(state, action: PayloadAction<string | null>) {
      state.activeSandboxId = action.payload;
      // Reset any custom explorer root when a new sandbox is connected so
      // the user always starts at the adapter's default path.
      state.explorerRootOverride = null;
      // Disconnecting clears the proxy URL too; re-connecting will set
      // it via `setActiveSandboxProxyUrl` below.
      if (action.payload === null) {
        state.activeSandboxProxyUrl = null;
      }
    },
    setActiveSandboxProxyUrl(state, action: PayloadAction<string | null>) {
      state.activeSandboxProxyUrl = action.payload;
    },
    setExplorerRootOverride(state, action: PayloadAction<string | null>) {
      state.explorerRootOverride = action.payload;
    },
    /**
     * Mirror the active filesystem adapter into Redux. Called by
     * `CodeWorkspaceProvider` whenever `setFilesystem` runs so selectors
     * and thunks (especially the agent execute thunks deciding which
     * baseUrl to call) can see the current source-of-truth without
     * reaching into React context.
     */
    setActiveFilesystem(
      state,
      action: PayloadAction<{
        id: string;
        label: string;
        rootPath: string;
        mode: EditorMode;
      }>,
    ) {
      const { id, label, rootPath, mode } = action.payload;
      state.activeFilesystemId = id;
      state.activeFilesystemLabel = label;
      state.activeFilesystemRoot = rootPath;
      state.editorMode = mode;
    },
    bumpFreshSession(state) {
      state.freshSessionNonce += 1;
    },
  },
});

export const {
  setActiveView,
  setSideOpen,
  setRightOpen,
  setFarRightOpen,
  setActiveSandboxId,
  setActiveSandboxProxyUrl,
  setExplorerRootOverride,
  setActiveFilesystem,
  bumpFreshSession,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

type WithCodeWorkspace = { codeWorkspace: CodeWorkspaceState };

export const selectCodeWorkspace = (state: WithCodeWorkspace) =>
  state.codeWorkspace ?? initialState;

export const selectActiveView = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeView;
export const selectSideOpen = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).sideOpen;
export const selectRightOpen = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).rightOpen;
export const selectFarRightOpen = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).farRightOpen;
export const selectActiveSandboxId = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeSandboxId;
export const selectActiveSandboxProxyUrl = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeSandboxProxyUrl;
export const selectExplorerRootOverride = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).explorerRootOverride;
export const selectEditorMode = (state: WithCodeWorkspace): EditorMode =>
  selectCodeWorkspace(state).editorMode;
export const selectActiveFilesystemId = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeFilesystemId;
export const selectActiveFilesystemRoot = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeFilesystemRoot;
export const selectActiveFilesystemLabel = (state: WithCodeWorkspace) =>
  selectCodeWorkspace(state).activeFilesystemLabel;
export const selectCodeWorkspaceFreshSessionNonce = (
  state: WithCodeWorkspace,
) => selectCodeWorkspace(state).freshSessionNonce;

/**
 * Derive an `EditorMode` from a filesystem adapter id. Lives here (not
 * inside the provider) so non-provider call sites can classify a
 * candidate adapter id BEFORE swapping it in — used by the orchestrator
 * proxy hook to decide whether to set/clear the per-conversation
 * server override.
 *
 * The current id taxonomy:
 *   - `sandbox:<instanceId>` — orchestrator-managed container
 *   - `mock:*` / `mock`      — `MockFilesystemAdapter`
 *   - everything else        — treated as cloud (cloud-files, future
 *                              local-FS-via-CLI, etc.)
 */
export function classifyEditorMode(filesystemId: string): EditorMode {
  if (filesystemId.startsWith("sandbox:")) return "sandbox";
  if (filesystemId === "mock" || filesystemId.startsWith("mock:")) {
    return "mock";
  }
  return "cloud";
}
