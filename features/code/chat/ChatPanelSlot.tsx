"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRight, PanelRightOpen, Plus, Settings2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import {
  selectFarRightOpen,
  setFarRightOpen,
} from "../redux/codeWorkspaceSlice";
import { SidePanelHeader, SidePanelAction } from "../views/SidePanelChrome";
import { AVATAR_RESERVE } from "../styles/tokens";
import { AgentPicker } from "./AgentPicker";
import { useCodeWorkspaceHistory } from "./useCodeWorkspaceHistory";
import { ContextChip } from "../agent-context/ContextChip";
import { useSyncEditorContext } from "../agent-context/useSyncEditorContext";
import { useBindAgentToSandbox } from "../agent-context/useBindAgentToSandbox";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
} from "../redux/codeWorkspaceSlice";
import { setResponseDensity } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

interface ChatPanelSlotProps {
  /** Base path used by header controls inside the runner. Defaults to the
   *  current `/code` route so in-panel navigation stays inside the workspace. */
  basePath?: string;
  className?: string;
  /** When true, the top row reserves space for the app's floating avatar. */
  rightmost?: boolean;
  /** If `?agentId=` isn't already in the URL when this slot first mounts,
   *  inject this id so the chat panel boots with a sensible coding agent
   *  instead of showing the empty-state picker. Used by focused-edit
   *  surfaces (e.g. the agent-apps editor) to prefer a specific
   *  prompt-app-development assistant. The user can still pick a
   *  different agent after mount. */
  defaultAgentId?: string;
}

const CODE_WORKSPACE_SETTINGS_TAB = "editor.codeWorkspace";

/**
 * Right-slot host for the conversational agent surface. Reads `?agentId=`
 * from the URL and mounts `AgentRunnerPage` when an agent is selected,
 * otherwise shows an inline picker. Pure UI-level composition — no Redux
 * state owned here.
 *
 * The inline / empty-state pickers are seeded with the user's saved
 * `coding.agentFilter` so the roster stays focused on coding agents; the
 * user can bypass the filter or open Settings directly from the picker.
 */
export const ChatPanelSlot: React.FC<ChatPanelSlotProps> = ({
  basePath = "/code",
  className,
  rightmost = false,
  defaultAgentId,
}) => {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const agentId = searchParams.get("agentId");
  const conversationIdFromUrl = searchParams.get("conversationId");

  // If the host supplied a `defaultAgentId` and the URL doesn't already
  // pin one, write it into `?agentId=` once on mount. This is the only
  // place we touch the chat-panel agent selection — the user can still
  // pick a different agent at any time, and we never overwrite an
  // existing `?agentId=`. Idempotent across re-renders.
  useEffect(() => {
    if (!defaultAgentId) return;
    if (agentId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("agentId", defaultAgentId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // We deliberately depend on `defaultAgentId` only — once the URL has
    // an agentId it stays sticky across reruns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAgentId]);
  const { filter } = useCodeWorkspaceHistory();
  const farRightOpen = useAppSelector(selectFarRightOpen);

  // The runner registers itself with surfaceKey `agent-runner:${agentId}` —
  // mirror that string here so we can read the focused conversation directly
  // from Redux. The URL only catches up after the runner finishes its
  // pendingNavigation → router.replace handshake, which is too late for
  // the bridge to seed context for the FIRST message of a fresh chat.
  const focusSurfaceKey = agentId ? `agent-runner:${agentId}` : "";
  const focusedConversationId = useAppSelector(
    focusSurfaceKey ? selectFocusedConversation(focusSurfaceKey) : () => null,
  );
  const conversationId = focusedConversationId ?? conversationIdFromUrl;

  useEffect(() => {
    if (conversationId) {
      dispatch(setResponseDensity({ conversationId, density: "compact" }));
    }
  }, [conversationId, dispatch]);

  // Auto-mount the editor → agent context bridge whenever both a workspace
  // tab set and a chat instance are live. The hook is a no-op when
  // `conversationId` is null, so it's safe to call unconditionally.
  useSyncEditorContext(conversationId);

  // Sandbox-mode binding: when the editor is attached to a sandbox AND the
  // orchestrator surfaced a per-sandbox proxy URL, redirect THIS conversation's
  // AI calls into the in-container Python server. The hook is a no-op when:
  //   • `editorMode !== "sandbox"` (cloud / mock surface), or
  //   • `proxyUrl` is null (orchestrator hasn't shipped `proxy_url` yet), or
  //   • `conversationId` is null (no chat focused yet).
  // Other backend traffic (notes, settings, etc.) keeps using the global
  // `apiConfigSlice` URL — this scope only affects agent execute thunks.
  const proxyUrl = useAppSelector(selectActiveSandboxProxyUrl);
  const sandboxRowId = useAppSelector(selectActiveSandboxId);
  useBindAgentToSandbox({ conversationId, proxyUrl, sandboxRowId });

  const openSettings = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: { initialTabId: CODE_WORKSPACE_SETTINGS_TAB },
      }),
    );
  }, [dispatch]);

  const handleNewChat = useCallback(() => {
    if (!agentId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("conversationId");
    router.replace(`${pathname}?${next.toString()}`);
  }, [agentId, pathname, router, searchParams]);

  // Code workspace lives at `${basePath}?agentId=X` — no nested `/run` segment.
  // Override the runner's default URL builder so fork / retry navigation
  // stays inside whichever surface mounted this slot. `basePath` defaults
  // to `/code` for the canonical workspace; embedded surfaces (e.g. the
  // agent-apps editor) pass their own pathname so forks stay in-route.
  const buildConversationUrl = useMemo(() => {
    if (!agentId) return undefined;
    return (conversationId: string) =>
      `${basePath}?agentId=${encodeURIComponent(agentId)}&conversationId=${encodeURIComponent(
        conversationId,
      )}`;
  }, [agentId, basePath]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
      <SidePanelHeader
        title="Chat"
        actions={
          <div className="flex items-center gap-1">
            <ContextChip conversationId={conversationId} />
            <AgentPicker
              variant="inline"
              filter={filter}
              settingsTabId={CODE_WORKSPACE_SETTINGS_TAB}
            />
            {agentId && (
              <SidePanelAction
                icon={Plus}
                label="New chat"
                onClick={handleNewChat}
              />
            )}
            <SidePanelAction
              icon={Settings2}
              label="Chat settings"
              onClick={openSettings}
            />
            <SidePanelAction
              icon={farRightOpen ? PanelRightOpen : PanelRight}
              label={farRightOpen ? "Hide History" : "Show History"}
              active={farRightOpen}
              onClick={() => dispatch(setFarRightOpen(!farRightOpen))}
            />
          </div>
        }
        className={rightmost ? AVATAR_RESERVE : undefined}
      />
      <div className="min-h-0 flex-1">
        {agentId ? (
          <AgentRunnerPage
            agentId={agentId}
            basePath={basePath}
            backHref={basePath}
            buildConversationUrl={buildConversationUrl}
          />
        ) : (
          <AgentPicker
            variant="empty-state"
            filter={filter}
            settingsTabId={CODE_WORKSPACE_SETTINGS_TAB}
          />
        )}
      </div>
    </div>
  );
};

export default ChatPanelSlot;
