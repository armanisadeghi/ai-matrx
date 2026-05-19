"use client";

/**
 * ChatDebugModal
 *
 * Admin/creator debug panel for the cx-conversation system.
 * Mirrors CreatorOptionsModal but wired to chatConversations Redux state
 * (sessionId-scoped) instead of the legacy prompt-execution runId system.
 *
 * Shown when an admin clicks the bug icon inside ConversationInput.
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  toggleDebugMode,
  selectIsDebugMode,
} from "@/lib/redux/preferences/adminDebugSlice";
import { chatConversationsActions } from "./_legacy-stubs";
import {
  selectShowDebugInfo,
  selectShowSystemMessages,
  selectUIState,
  selectSession,
  selectMessages,
  selectResources,
} from "./_legacy-stubs";

interface ChatDebugModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ChatDebugModal({
  sessionId,
  isOpen,
  onClose,
}: ChatDebugModalProps) {
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
        updates: {
          showDebugInfo: checked,
          showSystemMessages: checked,
        },
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdmin ? "Admin Debug Options" : "Debug Options"}
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {isAdmin ? "ADMIN" : "DEV"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Debug and control the active conversation session.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* ── Admin-only: Global Debug Mode ──────────────────── */}
          {isAdmin && (
            <>
              <div className="flex items-center justify-between space-x-2 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                <Label
                  htmlFor="global-debug"
                  className="flex flex-col space-y-1"
                >
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
          <div className="flex items-center justify-between space-x-2">
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

          <div className="flex items-center justify-between space-x-2 pl-4 border-l-2 border-muted">
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
              <div className="flex items-center justify-between space-x-2">
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

              <div className="flex items-center justify-between space-x-2">
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
                      <pre>
                        {JSON.stringify(uiState.modelSettings, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ChatDebugModal;
