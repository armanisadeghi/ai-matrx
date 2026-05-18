"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  toggleDebugMode,
  selectIsDebugMode,
} from "@/lib/redux/slices/adminDebugSlice";
// Legacy chat debug window — reads removed `chatConversations` slice. Debug
// UI is non-critical; stubbed to render empty while chat is rebuilt.
import type { RootState } from "@/lib/redux/store";
const chatConversationsActions = {
  updateUIState: (_payload: unknown) => ({
    type: "noop" as const,
    payload: _payload,
  }),
};
const selectShowDebugInfo = (_state: RootState, _sessionId: string): boolean =>
  false;
const selectShowSystemMessages = (
  _state: RootState,
  _sessionId: string,
): boolean => false;
type ChatDebugUIState = {
  useLocalhost?: boolean;
  isBlockMode?: boolean;
  modelOverride?: string | null;
  modelSettings?: Record<string, unknown>;
};
type ChatDebugSession = {
  conversationId?: string | null;
  agentId?: string | null;
  apiMode?: string | null;
  status?: string | null;
};
const EMPTY_MESSAGES: unknown[] = [];
const EMPTY_RESOURCES: unknown[] = [];
const EMPTY_UI_STATE: ChatDebugUIState = {};
const selectUIState = (
  _state: RootState,
  _sessionId: string,
): ChatDebugUIState => EMPTY_UI_STATE;
const selectSession = (
  _state: RootState,
  _sessionId: string,
): ChatDebugSession | undefined => undefined;
const selectMessages = (_state: RootState, _sessionId: string): unknown[] =>
  EMPTY_MESSAGES;
const selectResources = (_state: RootState, _sessionId: string): unknown[] =>
  EMPTY_RESOURCES;
import { WindowPanel } from "@/features/window-panels/WindowPanel";

// ─── Window inner ─────────────────────────────────────────────────────────────

function ChatDebugWindowInner({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isGlobalDebugMode = useAppSelector(selectIsDebugMode);
  const showDebugInfo = useAppSelector((s) =>
    selectShowDebugInfo(s, sessionId),
  );
  const showSystemMessages = useAppSelector((s) =>
    selectShowSystemMessages(s, sessionId),
  );
  const uiState = useAppSelector((s) => selectUIState(s, sessionId));
  const session = useAppSelector((s) => selectSession(s, sessionId));
  const messages = useAppSelector((s) => selectMessages(s, sessionId));
  const resources = useAppSelector((s) => selectResources(s, sessionId));

  const toggleShowDebugInfo = (checked: boolean) => {
    dispatch(
      chatConversationsActions.updateUIState({
        sessionId,
        updates: { showDebugInfo: checked, showSystemMessages: checked },
      }),
    );
  };

  const toggleShowSystemMessages = (checked: boolean) => {
    dispatch(
      chatConversationsActions.updateUIState({
        sessionId,
        updates: { showSystemMessages: checked },
      }),
    );
  };

  const toggleLocalhost = (checked: boolean) => {
    dispatch(
      chatConversationsActions.updateUIState({
        sessionId,
        updates: { useLocalhost: checked },
      }),
    );
  };

  const toggleBlockMode = (checked: boolean) => {
    dispatch(
      chatConversationsActions.updateUIState({
        sessionId,
        updates: { isBlockMode: checked },
      }),
    );
  };

  return (
    <WindowPanel
      id="chat-debug-window"
      title={isAdmin ? "Admin Debug Options" : "Debug Options"}
      titleNode={
        <span className="flex items-center gap-2">
          {isAdmin ? "Admin Debug Options" : "Debug Options"}
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {isAdmin ? "ADMIN" : "DEV"}
          </Badge>
        </span>
      }
      onClose={onClose}
      width={480}
      height={560}
      minWidth={360}
      minHeight={300}
      overlayId="chatDebugWindow"
    >
      <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
        {/* ── Admin-only: Global Debug Mode ──────────────────── */}
        {isAdmin && (
          <>
            <div className="flex items-center justify-between gap-2 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
              <Label htmlFor="global-debug" className="flex flex-col space-y-1">
                <span className="text-red-700 dark:text-red-300 font-semibold">
                  Global Debug Mode
                </span>
                <span className="font-normal text-xs text-red-600 dark:text-red-400">
                  Enable system-wide debug features and indicators across all
                  sessions
                </span>
              </Label>
              <Switch
                id="global-debug"
                checked={isGlobalDebugMode}
                onCheckedChange={() => dispatch(toggleDebugMode())}
              />
            </div>
            <Separator />
          </>
        )}

        {/* ── Session Debug ───────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="session-debug" className="flex flex-col space-y-1">
            <span>Session Debug Mode</span>
            <span className="font-normal text-xs text-muted-foreground">
              Show system messages and raw session details
            </span>
          </Label>
          <Switch
            id="session-debug"
            checked={showDebugInfo}
            onCheckedChange={toggleShowDebugInfo}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pl-4 border-l-2 border-muted">
          <Label htmlFor="show-system" className="flex flex-col space-y-1">
            <span>Show System Messages</span>
            <span className="font-normal text-xs text-muted-foreground">
              Display system-role messages in the conversation
            </span>
          </Label>
          <Switch
            id="show-system"
            checked={showSystemMessages}
            onCheckedChange={toggleShowSystemMessages}
            disabled={!showDebugInfo}
          />
        </div>

        <Separator />

        {/* ── Admin-only: Server / Execution Controls ──────── */}
        {isAdmin && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="use-localhost"
                className="flex flex-col space-y-1"
              >
                <span>Use Localhost Backend</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Route this session&apos;s API calls to the local dev server
                </span>
              </Label>
              <Switch
                id="use-localhost"
                checked={uiState.useLocalhost}
                onCheckedChange={toggleLocalhost}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="block-mode" className="flex flex-col space-y-1">
                <span>Block Mode</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Route sendMessage to the agents-blocks endpoint
                </span>
              </Label>
              <Switch
                id="block-mode"
                checked={uiState.isBlockMode}
                onCheckedChange={toggleBlockMode}
              />
            </div>

            <Separator />

            {/* ── Raw Session State ────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Session State
              </p>
              <div className="rounded-md bg-muted/60 border border-border p-3 text-[10px] font-mono space-y-1 text-muted-foreground">
                <div>
                  <span className="text-foreground">sessionId:</span>{" "}
                  {sessionId}
                </div>
                <div>
                  <span className="text-foreground">conversationId:</span>{" "}
                  {session?.conversationId ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">agentId:</span>{" "}
                  {session?.agentId ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">apiMode:</span>{" "}
                  {session?.apiMode ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">status:</span>{" "}
                  {session?.status ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">messages:</span>{" "}
                  {messages.length}
                </div>
                <div>
                  <span className="text-foreground">resources:</span>{" "}
                  {resources.length}
                </div>
                <div>
                  <span className="text-foreground">modelOverride:</span>{" "}
                  {uiState.modelOverride ?? "—"}
                </div>
                <div>
                  <span className="text-foreground">useLocalhost:</span>{" "}
                  {String(uiState.useLocalhost)}
                </div>
                <div>
                  <span className="text-foreground">isBlockMode:</span>{" "}
                  {String(uiState.isBlockMode)}
                </div>
              </div>
            </div>

            {/* Model settings (only if any are set) */}
            {uiState.modelSettings &&
              Object.keys(uiState.modelSettings).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Model Settings Override
                  </p>
                  <div className="rounded-md bg-muted/60 border border-border p-3 text-[10px] font-mono text-muted-foreground max-h-40 overflow-y-auto">
                    <pre>{JSON.stringify(uiState.modelSettings, null, 2)}</pre>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </WindowPanel>
  );
}

// ─── Window shell ─────────────────────────────────────────────────────────────

interface ChatDebugWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

export default function ChatDebugWindow({
  isOpen,
  onClose,
  sessionId,
}: ChatDebugWindowProps) {
  if (!isOpen || !sessionId) return null;
  return <ChatDebugWindowInner sessionId={sessionId} onClose={onClose} />;
}
