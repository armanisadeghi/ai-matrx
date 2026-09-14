"use client";

/**
 * ChatConnectionsStrip — the one line under EVERY composer that says what this
 * conversation can actually reach, and opens the place that changes it.
 *
 * Arman, 2026-09-14: "I don't see an MCP chip."
 *
 * The honest three-state chips existed — two clicks deep, inside the Tools
 * picker, in a three-row scroll box. The line under the composer belonged to
 * `ChatConnectorStrip`, a randomized three-of-the-catalog "you could connect
 * these" bag: on a live check it showed Nuxt / Clerk / Notion while this
 * chat's own servers, and a server attached seconds earlier, appeared nowhere.
 * So the composer answered a question nobody asked and stayed silent on the
 * one that matters.
 *
 * The champion bar (Claude.ai and ChatGPT connectors, Cursor's MCP indicator):
 * attached services are legible from the composer without opening anything,
 * and are one click from the surface that manages them.
 *
 * Order of speech, therefore:
 *   1. wired to something → say what, with its real state, worst first;
 *   2. wired to nothing   → the suggestion strip keeps the line (it is a
 *      reminder, and there is nothing truer to show).
 *
 * Every chip is the run's truth, never a hope: `mcpChipPresentation` is the
 * same pure decision the Tools picker uses, so a checkmark here means attached
 * AND connected AND nothing in this run saying otherwise.
 */

import { useState } from "react";
import { AlertTriangle, Check, Server } from "lucide-react";
import { BottomSheet } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ChatConnectorStrip } from "@/features/connectors/ChatConnectorStrip";
import { selectChatConnections } from "@/features/connectors/chat-connections";
import {
  indexRunMcpAttachments,
  mcpChipPresentation,
  readRunMcpAttachments,
} from "@/features/connectors/run-attachments";
import { useMcpCatalog } from "@/features/agents/hooks/useMcpTools";
import { selectAgentMcpServers } from "@/features/agents/redux/agent-definition/selectors";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { RunToolPicker } from "./RunToolPicker";

export interface ChatConnectionsStripProps {
  conversationId: string | null | undefined;
  className?: string;
}

export function ChatConnectionsStrip({
  conversationId,
  className,
}: ChatConnectionsStripProps) {
  const { serverStates } = useMcpCatalog();
  const openRunControlsWindow = useOpenRunControlsWindow();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const agentId = useAppSelector(
    selectAgentIdFromInstance(conversationId ?? ""),
  );
  const agentMcpServers = useAppSelector((s) =>
    agentId ? selectAgentMcpServers(s, agentId) : undefined,
  );
  const settings = useAppSelector(
    selectBuilderAdvancedSettings(conversationId ?? ""),
  );
  const primaryRequest = useAppSelector(
    selectPrimaryRequest(conversationId ?? ""),
  );

  const runAttachments = indexRunMcpAttachments(
    readRunMcpAttachments(primaryRequest?.infoEvents, primaryRequest?.warnings),
  );

  // No useMemo — React Compiler memoizes (CLAUDE.md core invariant).
  const connections = conversationId
    ? selectChatConnections({
        agentServerSlugs: (agentMcpServers ?? []).filter(
          (slug): slug is string => typeof slug === "string",
        ),
        addedServerSlugs: settings?.addedMcpServers ?? [],
        catalog: serverStates.map((s) => ({
          slug: s.entry.slug,
          name: s.entry.name,
          state: s.truth.state,
          reason: s.truth.reason,
        })),
        runAttachments,
      })
    : [];

  // Nothing wired to this chat: the suggestion reminder keeps the line. It is
  // the honest thing to show when there is no attachment to report.
  if (connections.length === 0) {
    return <ChatConnectorStrip className={className} />;
  }

  const broken = connections.filter((c) => c.state !== "connected").length;

  const openPicker = () => {
    if (!conversationId) return;
    // A window is never the mobile answer (RunControlsMenu keeps the same
    // rule); the sheet carries the identical picker.
    if (isMobile) {
      setSheetOpen(true);
      return;
    }
    openRunControlsWindow({ conversationId, initialTab: "tools" });
  };

  return (
    <>
      <div
        className={cn(
          "flex h-4 w-full items-center gap-1 overflow-x-auto scrollbar-hide",
          className,
        )}
      >
        <button
          type="button"
          onClick={openPicker}
          title="Connections for this chat — open the Tools picker"
          aria-label={`Connections for this chat: ${connections.length} service${connections.length === 1 ? "" : "s"}${broken > 0 ? `, ${broken} need attention` : ""}. Open the Tools picker.`}
          className="group flex shrink-0 items-center gap-1 rounded-full pr-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Server className="h-3 w-3 text-primary" aria-hidden />
          <span className="uppercase tracking-wide">Connections</span>
        </button>

        {connections.map((connection) => {
          const presentation = mcpChipPresentation(
            connection.state,
            connection.reason,
            true,
            connection.runAttachment,
          );
          const isBroken = presentation.kind === "broken";
          return (
            <button
              key={connection.slug}
              type="button"
              onClick={openPicker}
              title={
                presentation.reason ??
                (presentation.toolCount != null
                  ? `${connection.name} — ${presentation.toolCount} tools reached this run`
                  : `${connection.name} — connected`)
              }
              className={cn(
                // `before:` expands the touch target on mobile without adding
                // a pixel of height (same trick as ConnectorStrip).
                "group relative inline-flex h-4 shrink-0 items-center gap-1 rounded-full border pl-1 pr-1.5 text-[10px] font-medium leading-none transition-colors",
                "before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] sm:before:hidden",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isBroken
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                  : "border-border/50 bg-card/50 text-foreground/80 hover:border-border hover:bg-accent",
              )}
            >
              {isBroken ? (
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
              ) : (
                <Check className="h-2.5 w-2.5 text-success/80" aria-hidden />
              )}
              <span className="max-w-[6rem] truncate sm:max-w-[10rem]">
                {connection.name}
              </span>
              {isBroken && presentation.status && (
                <span className="font-normal">{presentation.status}</span>
              )}
              {/* A count only when the run actually reported one. */}
              {!isBroken && presentation.toolCount != null && (
                <span className="font-normal tabular-nums text-muted-foreground">
                  {presentation.toolCount} tools
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isMobile && conversationId && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Tools"
          size="full"
          surface="solid"
        >
          <RunToolPicker conversationId={conversationId} />
        </BottomSheet>
      )}
    </>
  );
}
