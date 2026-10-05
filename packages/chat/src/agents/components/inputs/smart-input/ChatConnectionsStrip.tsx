"use client";

/**
 * ChatConnectionsStrip — the line in the composer's + menu that says what this
 * conversation can actually reach, and opens the place that changes it.
 * (Under every composer until 2026-09-27; Arman moved it into the + menu.)
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
 * this conversation, and it keeps its own home (the live-integrations window). Never reintroduce an account-wide or
 * user-wide source here.
 */

import { Fragment, useState } from "react";
import { AlertTriangle, Check, Paperclip, Plus, Server } from "lucide-react";
import { BottomSheet } from "@ai-matrx/design-system";
import { useAppSelector } from "../../../../store/hooks";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { cn } from "@ai-matrx/design-system";
import { selectChatConnections } from "../../../connectors/chat-connections";
import {
  indexRunMcpAttachments,
  mcpChipPresentation,
  readRunMcpAttachments,
} from "../../../connectors/run-attachments";
import { useMcpCatalog } from "../../../hooks/useMcpTools";
import { selectAgentMcpServers } from "../../../redux/agent-definition/selectors";
import { selectAgentIdFromInstance } from "../../../redux/execution-system/conversations/conversations.selectors";
import { selectBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectPrimaryRequest } from "../../../redux/execution-system/active-requests/active-requests.selectors";
import { useOpenRunControlsWindow } from "../../../../host/window-openers";
import { attachActionLabel, type DisplayedAttachment } from "../../../connectors/attachable-resources";
import { useAttachResourcePicker } from "../../../../host/ui-slots";
import { useConversationAttachments } from "../../../../host/ui-slots";
import { ComposerConnectorsPanel } from "./composer/ComposerConnectorsPanel";
import { ComposerChip, ComposerChipPart } from "./ComposerChip";
import { Button } from "@ai-matrx/design-system/controls";

export interface ChatConnectionsStripProps {
  conversationId: string | null | undefined;
  className?: string;
  /**
   * The composer's chips row shows only what is LIVE (brief §7): with nothing
   * connected it renders nothing — the + menu's Connectors row stays the door.
   */
  hideWhenEmpty?: boolean;
  /**
   * `rail` (default) is the 16px line in a menu. `chips` is the composer's
   * chips row (brief §7): one 28px chip per connection, flowing inside the
   * host's row — the SAME data and doors, the composer's size.
   */
  variant?: "rail" | "chips";
  /**
   * Chips only (Advanced, A1): every resource chosen from an attachable
   * connection is its own chip (`name · default branch`), and a connection
   * with nothing chosen offers its chooser as a chip.
   */
  showResources?: boolean;
  /** Chips only: what the row shows when this chat has no connections (the composer's promo). */
  emptyChips?: React.ReactNode;
}

export function ChatConnectionsStrip({
  conversationId,
  className,
  hideWhenEmpty = false,
  variant = "rail",
  showResources = false,
  emptyChips = null,
}: ChatConnectionsStripProps) {
  const { serverStates } = useMcpCatalog();
  const openRunControlsWindow = useOpenRunControlsWindow();
  const openAttachPicker = useAttachResourcePicker();
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
  // Nothing on this chat offers resources to choose from → ask the server for
  // nothing. See the capability gate in `useConversationAttachments`.
  const attachments = useConversationAttachments(conversationId, {
    hasAttachableConnection: connections.some((c) => c.kind === "attachable"),
  });

  const openPicker = () => {
    if (!conversationId) return;
    // A window is never the mobile answer (RunControlsMenu keeps the same
    // rule); the sheet carries the identical picker.
    if (isMobile) {
      setSheetOpen(true);
      return;
    }
    openRunControlsWindow({ conversationId, initialTab: "connections" });
  };

  // The mobile picker rides BOTH states — an empty rail whose only control
  // does nothing on a phone is a dead control (law 4).
  const mobilePicker =
    isMobile && conversationId ? (
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Connections"
        size="full"
        surface="solid"
      >
        <ComposerConnectorsPanel conversationId={conversationId} onNavigate={() => setSheetOpen(false)} />
      </BottomSheet>
    ) : null;

  if (variant === "chips") {
    if (!conversationId) return null;
    if (connections.length === 0) return <>{emptyChips}</>;
    // What was chosen is only spoken once the read ANSWERED: before that a
    // "+ Choose…" chip would claim nothing is chosen, and after a failed read
    // the chip says so and retries — never a count of 0 that is really an error.
    const attachmentsRead = attachments.error ? "failed" : attachments.status;
    return (
      <>
        {connections.map((connection) => {
          const presentation = mcpChipPresentation(
            connection.state,
            connection.reason,
            true,
            connection.runAttachment,
          );
          const isBroken = presentation.kind === "broken";
          const chooserLabel =
            connection.kind === "attachable"
              ? attachActionLabel(connection.attachable)
              : null;
          const chosen = attachments.items.filter(
            (item: DisplayedAttachment) => item.provider === connection.slug,
          );
          const openChooser = () =>
            openAttachPicker({
              conversationId,
              provider: connection.slug,
              providerName: connection.name,
              attachable: connection.attachable,
            });
          return (
            <Fragment key={connection.slug}>
              <ComposerChip
                tone={isBroken ? "warning" : "neutral"}
                onClick={openPicker}
                aria-label={`${connection.name} — ${presentation.reason ?? (isBroken ? "needs attention" : "connected")}. Open Connections.`}
                title={
                  presentation.reason ??
                  (presentation.toolCount != null
                    ? `${connection.name} — ${presentation.toolCount} tools reached this run`
                    : `${connection.name} — connected`)
                }
                icon={
                  isBroken ? (
                    <AlertTriangle aria-hidden />
                  ) : (
                    <Check className="text-success" aria-hidden />
                  )
                }
                label={connection.name}
                trailing={
                  isBroken && presentation.status ? (
                    <span>{presentation.status}</span>
                  ) : !isBroken && presentation.toolCount != null ? (
                    <span className="tabular-nums text-muted-foreground">
                      {presentation.toolCount} tools
                    </span>
                  ) : undefined
                }
                parts={
                  /* Work: the chooser rides the connection chip as a count.
                     Advanced lists what was chosen as chips of their own. */
                  chooserLabel && attachmentsRead === "succeeded" && !showResources && chosen.length > 0 ? (
                    <ComposerChipPart
                      lit
                      onClick={openChooser}
                      aria-label={`${chosen.length} attached to this chat from ${connection.name} — ${chooserLabel}`}
                      title={`${chosen.length} attached to this chat — ${chooserLabel}`}
                    >
                      <Paperclip aria-hidden />
                      <span className="tabular-nums">{chosen.length}</span>
                    </ComposerChipPart>
                  ) : undefined
                }
              />
              {chooserLabel && attachmentsRead === "failed" ? (
                <ComposerChip
                  tone="warning"
                  onClick={attachments.reload}
                  title={attachments.error ?? undefined}
                  icon={<AlertTriangle aria-hidden />}
                  label="What is attached did not load · Retry"
                />
              ) : null}
              {chooserLabel && attachmentsRead === "succeeded" && showResources
                ? chosen.map((item: DisplayedAttachment) => {
                    // The provider's own default branch when it published one
                    // (a repository); any other resource simply has none.
                    const declaredBranch = item.metadata?.default_branch;
                    const branch = typeof declaredBranch === "string" ? declaredBranch : null;
                    return (
                      <ComposerChip
                        key={`${item.provider}:${item.resource_ref}`}
                        onClick={openChooser}
                        busy={item.pending}
                        title={
                          item.pending
                            ? `${item.display_name} — saving to this chat`
                            : `${item.display_name}${branch ? ` · ${branch}` : ""} — ${chooserLabel}`
                        }
                        icon={<Paperclip className="text-muted-foreground" aria-hidden />}
                        label={item.display_name}
                        trailing={
                          branch ? <span className="text-muted-foreground">· {branch}</span> : undefined
                        }
                      />
                    );
                  })
                : null}
              {chooserLabel && attachmentsRead === "succeeded" && showResources && chosen.length === 0 ? (
                <ComposerChip
                  tone="quiet"
                  onClick={openChooser}
                  icon={<Plus aria-hidden />}
                  label={chooserLabel}
                />
              ) : null}
            </Fragment>
          );
        })}
        {mobilePicker}
      </>
    );
  }

  // Nothing is wired to this chat. The honest line says so and stays one click
  // from the picker that changes it — it never borrows another scope's items
  // to look busy. With no conversation there is no picker to open, and nothing
  // truthful to say, so the line is absent rather than dead.
  if (connections.length === 0) {
    if (!conversationId || hideWhenEmpty) return null;
    return (
      <>
        <div
          className={cn(
            "flex h-6 w-full items-center gap-1.5 overflow-x-auto scrollbar-hide",
            className,
          )}
        >
          <Button variant="quiet" icon={<Server />} onClick={openPicker} title="Nothing is connected to this chat — open Connections to add a service" aria-label="Nothing is connected to this chat. Open Connections to add a service." className="shrink-0">Connections: none</Button>
        </div>
        {mobilePicker}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex h-6 w-full items-center gap-1.5 overflow-x-auto scrollbar-hide",
          className,
        )}
      >
        <Button variant="quiet" icon={<Server />} glyphTone="primary" onClick={openPicker} title="Connections for this chat — open Connections" aria-label={`Connections for this chat: ${connections.length} service${connections.length === 1 ? "" : "s"}${broken > 0 ? `, ${broken} need attention` : ""}. Open Connections.`} className="shrink-0">Connections</Button>

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
            (item: DisplayedAttachment) => item.provider === connection.slug,
          ).length;
          return (
            <ComposerChip
              key={connection.slug}
              tone={isBroken ? "warning" : "neutral"}
              onClick={openPicker}
              aria-label={`${connection.name} — ${presentation.reason ?? (isBroken ? "needs attention" : "connected")}. Open Connections.`}
              title={
                presentation.reason ??
                (presentation.toolCount != null
                  ? `${connection.name} — ${presentation.toolCount} tools reached this run`
                  : `${connection.name} — connected`)
              }
              icon={
                isBroken ? (
                  <AlertTriangle aria-hidden />
                ) : (
                  <Check className="text-success/80" aria-hidden />
                )
              }
              label={connection.name}
              trailing={
                isBroken && presentation.status ? (
                  <span className="font-normal">{presentation.status}</span>
                ) : !isBroken && presentation.toolCount != null ? (
                  /* A count only when the run actually reported one. */
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {presentation.toolCount} tools
                  </span>
                ) : undefined
              }
              parts={
                chooserLabel && conversationId ? (
                  <ComposerChipPart
                    lit={attachedCount > 0}
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
                      attachments.error
                        ? `What is attached did not load (${attachments.error}) — ${chooserLabel}`
                        : attachedCount > 0
                          ? `${attachedCount} attached to this chat — ${chooserLabel}`
                          : chooserLabel
                    }
                  >
                    <Paperclip aria-hidden />
                    {attachments.status === "succeeded" && attachedCount > 0 ? (
                      <span className="tabular-nums">{attachedCount}</span>
                    ) : (
                      <span className="font-normal">{chooserLabel}</span>
                    )}
                  </ComposerChipPart>
                ) : undefined
              }
            />
          );
        })}
      </div>

      {mobilePicker}
    </>
  );
}
