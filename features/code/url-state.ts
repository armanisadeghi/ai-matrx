import type { ActivityViewId, BottomTabId } from "./types";

/** Query keys owned by the `/code` workspace. Existing entity links keep
 * `open` and `folder`; chat keeps `agentId` and `conversationId`. */
export const CODE_WORKSPACE_URL_KEYS = {
  sandbox: "sandbox",
  file: "file",
  root: "root",
  view: "view",
  side: "side",
  chat: "chat",
  history: "history",
  bottom: "bottom",
  bottomTab: "bottomTab",
} as const;

const ACTIVITY_VIEWS = new Set<ActivityViewId>([
  "explorer",
  "search",
  "git",
  "source-control",
  "run",
  "extensions",
  "sandboxes",
  "library",
]);

const BOTTOM_TABS = new Set<BottomTabId>([
  "problems",
  "output",
  "debug",
  "terminal",
  "ports",
  "sandbox-status",
  "sandbox-files",
  "sandbox-env",
  "sandbox-ssh",
]);

export interface CodeWorkspaceUrlState {
  sandboxId: string | null;
  filePath: string | null;
  explorerRoot: string | null;
  activeView: ActivityViewId | null;
  sideOpen: boolean | null;
  rightOpen: boolean | null;
  farRightOpen: boolean | null;
  bottomOpen: boolean | null;
  bottomTab: BottomTabId | null;
}

export const EMPTY_CODE_WORKSPACE_URL_STATE: CodeWorkspaceUrlState = {
  sandboxId: null,
  filePath: null,
  explorerRoot: null,
  activeView: null,
  sideOpen: null,
  rightOpen: null,
  farRightOpen: null,
  bottomOpen: null,
  bottomTab: null,
};

function readBoolean(params: URLSearchParams, key: string): boolean | null {
  const value = params.get(key);
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function readAbsolutePath(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value?.startsWith("/") ? value : null;
}

/** Reads only validated workspace state. Unknown or malformed values are
 * ignored so a hand-edited link cannot put Redux into an impossible state. */
export function parseCodeWorkspaceUrlState(
  params: URLSearchParams,
): CodeWorkspaceUrlState {
  const view = params.get(CODE_WORKSPACE_URL_KEYS.view);
  const bottomTab = params.get(CODE_WORKSPACE_URL_KEYS.bottomTab);
  return {
    sandboxId: params.get(CODE_WORKSPACE_URL_KEYS.sandbox),
    filePath: readAbsolutePath(params, CODE_WORKSPACE_URL_KEYS.file),
    explorerRoot: readAbsolutePath(params, CODE_WORKSPACE_URL_KEYS.root),
    activeView: view && ACTIVITY_VIEWS.has(view as ActivityViewId)
      ? (view as ActivityViewId)
      : null,
    sideOpen: readBoolean(params, CODE_WORKSPACE_URL_KEYS.side),
    rightOpen: readBoolean(params, CODE_WORKSPACE_URL_KEYS.chat),
    farRightOpen: readBoolean(params, CODE_WORKSPACE_URL_KEYS.history),
    bottomOpen: readBoolean(params, CODE_WORKSPACE_URL_KEYS.bottom),
    bottomTab: bottomTab && BOTTOM_TABS.has(bottomTab as BottomTabId)
      ? (bottomTab as BottomTabId)
      : null,
  };
}

/** Applies workspace state without touching route-owned query parameters such
 * as `open`, `folder`, `agentId`, and `conversationId`. Null removes an owned
 * value so the URL remains small and backwards-compatible. */
export function withCodeWorkspaceUrlState(
  source: URLSearchParams,
  state: CodeWorkspaceUrlState,
): URLSearchParams {
  const params = new URLSearchParams(source);
  const set = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
  };
  set(CODE_WORKSPACE_URL_KEYS.sandbox, state.sandboxId);
  set(CODE_WORKSPACE_URL_KEYS.file, state.filePath);
  set(CODE_WORKSPACE_URL_KEYS.root, state.explorerRoot);
  set(CODE_WORKSPACE_URL_KEYS.view, state.activeView);
  set(CODE_WORKSPACE_URL_KEYS.side, state.sideOpen === null ? null : state.sideOpen ? "1" : "0");
  set(CODE_WORKSPACE_URL_KEYS.chat, state.rightOpen === null ? null : state.rightOpen ? "1" : "0");
  set(CODE_WORKSPACE_URL_KEYS.history, state.farRightOpen === null ? null : state.farRightOpen ? "1" : "0");
  set(CODE_WORKSPACE_URL_KEYS.bottom, state.bottomOpen === null ? null : state.bottomOpen ? "1" : "0");
  set(CODE_WORKSPACE_URL_KEYS.bottomTab, state.bottomTab);
  return params;
}
