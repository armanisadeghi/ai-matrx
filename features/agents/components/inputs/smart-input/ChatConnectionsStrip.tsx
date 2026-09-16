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
 *   2. wired to nothing   → say THAT, and keep the one click to the picker
 *      that changes it.
 *
 * Every chip is the run's truth, never a hope: `mcpChipPresentation` is the
 * same pure decision the Tools picker uses, so a checkmark here means attached
 * AND connected AND nothing in this run saying otherwise.
 *
 * 🚨 THE RAIL IS SCOPED TO THIS CONVERSATION — NOTHING ACCOUNT-WIDE RIDES IT.
 * Until 2026-09-15 the "wired to nothing" branch fell back to
 * `ChatConnectorStrip`, an ACCOUNT-level randomized rotation of the person's
 * live integrations. The vision interview's room voices carry no MCP servers,
 * so that branch is exactly the one they take, and the room's composer wore
 * "Reducto Public Documentation / Kestra Public Documentation / Firecrawl
 * Documentation / More" — three documentation connectors belonging to another
 * feature entirely, pinned above the box where a subject-matter expert is
 * describing their vision (census W1, 2026-09-15; reproduced live the same day
 * as "Fireflies Documentation / Pipedream Documentation / Meta Ads / More").
 * This component is mounted by `SmartAgentInput` under EVERY composer on the
 * platform, so that fallback leaked into every embedded chat surface at once,
 * not just this one. The suggestion strip is not wrong — it is just not about
 * this conversation, and it keeps its own homes (the `/chat/new` greeting and
 * the live-integrations window). Never reintroduce an account-wide or
 * user-wide source here.
 */

import { useState } from "react";
import { AlertTriangle, Check, Paperclip, Server } from "lucide-react";
import { BottomSheet } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
import { attachActionLabel } from "@/features/connectors/attachable-resources";
import { useAttachResourcePicker } from "@/features/connectors/useAttachResourcePicker";
import { useConversationAttachments } from "@/features/connectors/useConversationAttachments";
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
  const openAttachPicker = useAttachResourcePicker();
  const attachments = useConversationAttachments(conversationId);
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
          // The server says what this connection lets a person choose from —
          // repositories, files, sheets. Empty for a pure MCP server, and
          // that emptiness is what makes its chip plain.
          attachable: s.attachable,
        })),
        runAttachments,
      })
    : [];

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

  // The mobile picker rides BOTH states — an empty rail whose only control
  // does nothing on a phone is a dead control (law 4).
  const mobilePicker =
    isMobile && conversationId ? (
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Tools"
        size="full"
        surface="solid"
      >
        <RunToolPicker conversationId={conversationId} />
      </BottomSheet>
    ) : null;

  // Nothing is wired to this chat. The honest line says so and stays one click
  // from the picker that changes it — it never borrows another scope's items
  // to look busy. With no conversation there is no picker to open, and nothing
  // truthful to say, so the line is absent rather than dead.
  if (connections.length === 0) {
    if (!conversationId) return null;
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
            title="Nothing is connected to this chat — open the Tools picker to add a service"
            aria-label="Nothing is connected to this chat. Open the Tools picker to add a service."
            className="group flex shrink-0 items-center gap-1 rounded-full pr-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Server className="h-3 w-3 text-muted-foreground" aria-hidden />
            <span className="uppercase tracking-wide">Connections</span>
            <span className="font-normal normal-case tracking-normal">
              none for this chat
            </span>
          </button>
        </div>
        {mobilePicker}
      </>
    );
  }

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
          // The ONE difference between the two kinds of connection, made
          // visible: an attachable one carries a chooser door and a count of
          // what has been chosen; a pure MCP one carries neither, because it
          // has nothing to choose and a door onto nothing is a dead control.
          const chooserLabel =
            connection.kind === "attachable"
              ? attachActionLabel(connection.attachable)
              : null;
          const attachedCount = attachments.items.filter(
            (item) => item.provider === connection.slug,
          ).length;
          return (
            <span
              key={connection.slug}
              className={cn(
                // `before:` expands the touch target on mobile without adding
                // a pixel of height (same trick as ConnectorStrip).
                "group relative inline-flex h-4 shrink-0 items-center rounded-full border text-[10px] font-medium leading-none",
                "before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] sm:before:hidden",
                isBroken
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border/50 bg-card/50 text-foreground/80",
              )}
            >
              <button
                type="button"
                onClick={openPicker}
                aria-label={`${connection.name} — ${presentation.reason ?? (isBroken ? "needs attention" : "connected")}. Open the Tools picker.`}
                title={
                  presentation.reason ??
                  (presentation.toolCount != null
                    ? `${connection.name} — ${presentation.toolCount} tools reached this run`
                    : `${connection.name} — connected`)
                }
                className={cn(
                  "inline-flex h-4 items-center gap-1 rounded-l-full pl-1 pr-1.5 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isBroken
                    ? "hover:bg-amber-500/20"
                    : "hover:bg-accent",
                  !chooserLabel && "rounded-r-full",
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

              {chooserLabel && conversationId && (
                <button
                  type="button"
                  onClick={() =>
                    openAttachPicker({
                      conversationId,
                      provider: connection.slug,
                      providerName: connection.name,
                      attachable: connection.attachable,
                    })
                  }
                  aria-label={`${chooserLabel} from ${connection.name}${attachedCount > 0 ? ` — ${attachedCount} attached to this chat` : ""}`}
                  title={
                    attachedCount > 0
                      ? `${attachedCount} attached to this chat — ${chooserLabel}`
                      : chooserLabel
                  }
                  className={cn(
                    "inline-flex h-4 items-center gap-0.5 rounded-r-full border-l border-border/50 pl-1 pr-1.5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    attachedCount > 0
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Paperclip className="h-2.5 w-2.5" aria-hidden />
                  {attachedCount > 0 ? (
                    <span className="tabular-nums">{attachedCount}</span>
                  ) : (
                    <span className="font-normal">{chooserLabel}</span>
                  )}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {mobilePicker}
    </>
  );
}
