"use client";

/**
 * Connectors (brief §5, 360px) — every connector this person has, one clean
 * line each, in the + menu of EVERY mode:
 *
 *   Search
 *   ACTIVE IN THIS CHAT        name · [N chosen ›] or tool count · switch
 *   CONNECTED · OFF IN THIS CHAT  name · switch
 *   Browse all connectors ›    (the full directory — connect Google,
 *                               Microsoft, Notion, … anything new)
 *
 * Nothing new underneath: the catalog and its truth are `useMcpCatalog`, the
 * per-chat on/off is the per-conversation `addedMcpServers` setting,
 * reconnect is `useConnectMcpServer`, choosing repositories / files is the ONE
 * attach picker, and the directory is the live integrations window. An agent's
 * own connectors ride every run of that agent — their switch is on and fixed.
 */

import { selectPrimaryRequest } from "../../../../redux/execution-system/active-requests/active-requests.selectors";
import { indexRunMcpAttachments, readRunMcpAttachments, mcpChipPresentation } from "@host/features/connectors/run-attachments";
import { ErrorAlchemyMenu } from "@host/components/errors/ErrorAlchemyMenu";
import { AttachedResourcesSection } from "@host/features/connectors/AttachedResourcesSection";
import { useEffect, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { PickerSearchField } from "@host/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import { Switch } from "@host/components/ui/switch";
import { ConnectorMark } from "@ai-matrx/chat/host/ui-slots";
import { connectorDefinitionFromMcp } from "@ai-matrx/chat/host/ui-slots";
import { useAppDispatch, useAppSelector } from "../../../../../store/hooks";
import { useMcpCatalog, type McpServerState } from "../../../../hooks/useMcpTools";
import { selectAgentReadyForCustomExecution, selectAgentMcpServers } from "../../../../redux/agent-definition/selectors";
import { selectAgentIdFromInstance } from "../../../../redux/execution-system/conversations/conversations.selectors";
import { selectBuilderAdvancedSettings } from "../../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "../../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { useConnectMcpServer } from "@host/features/connectors/useConnectMcpServer";
import { attachActionLabel } from "@host/features/connectors/attachable-resources";
import { useAttachResourcePicker } from "@host/features/connectors/useAttachResourcePicker";
import { useConversationAttachments } from "@host/features/connectors/useConversationAttachments";
import { useOpenLiveIntegrationsWindow } from "../../../../../host/window-openers";
import { fetchAgentExecutionFull } from "../../../../redux/agent-definition/thunks";
import { fetchCatalog } from "../../../../redux/mcp/mcp.slice";
import { ComposerMenuLabel, ComposerMenuRow } from "./ComposerMenu";

export function ComposerConnectorsPanel({
  conversationId,
  onNavigate,
}: {
  conversationId: string;
  /** A row opened a window/picker — the host closes its menu. */
  onNavigate: () => void;
}) {
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");
  const { serverStates, catalog, status: catalogStatus, availabilityStatus, refreshAvailability } = useMcpCatalog();
  const { connect, connectingSlug } = useConnectMcpServer();
  const openAttachPicker = useAttachResourcePicker();
  const openDirectory = useOpenLiveIntegrationsWindow();
  const primaryRequest = useAppSelector(selectPrimaryRequest(conversationId));
  const runAttachments = indexRunMcpAttachments(readRunMcpAttachments(primaryRequest?.infoEvents, primaryRequest?.warnings));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentServers = useAppSelector((state) => (agentId ? selectAgentMcpServers(state, agentId) : undefined));
  const agentReady = useAppSelector((state) => agentId ? selectAgentReadyForCustomExecution(state, agentId) : false);
  useEffect(() => {
    if (agentId && !agentReady) void dispatch(fetchAgentExecutionFull(agentId));
  }, [agentId, agentReady, dispatch]);
  const settings = useAppSelector(selectBuilderAdvancedSettings(conversationId));
  const added = settings?.addedMcpServers ?? [];
  const agentSlugs = new Set((agentServers ?? []).filter((slug): slug is string => typeof slug === "string"));
  const isActive = (slug: string) => agentSlugs.has(slug) || added.includes(slug);

  const attachments = useConversationAttachments(conversationId, {
    hasAttachableConnection: serverStates.some((s) => isActive(s.entry.slug) && s.attachable.length > 0),
  });

  const matches = (s: McpServerState) =>
    !query.trim() || s.entry.name.toLowerCase().includes(query.trim().toLowerCase());
  const active = serverStates.filter((s) => isActive(s.entry.slug) && matches(s));
  // "Yours": a connection on file, or one that needs re-authorizing.
  const connectedOff = serverStates.filter(
    (s) =>
      !isActive(s.entry.slug) &&
      (s.entry.connectionId !== null || s.truth.state === "needs_reauth" || s.truth.state === "connected" || Boolean(runAttachments[s.entry.slug])) &&
      matches(s),
  );

  const setOn = (slug: string, on: boolean) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedMcpServers: on ? [...new Set([...added, slug])] : added.filter((s) => s !== slug) },
      }),
    );

  const row = (s: McpServerState, on: boolean) => {
    const runAttachment = runAttachments[s.entry.slug];
    const presentation = mcpChipPresentation(s.truth.state, s.truth.reason, on || (runAttachment !== undefined && runAttachment.state !== "connected"), runAttachment);
    const toolCount = runAttachment ? presentation.toolCount : s.toolCount;
    const broken = presentation.kind === "broken";
    const agentOwned = agentSlugs.has(s.entry.slug);
    const chooser = s.attachable.length > 0 ? attachActionLabel(s.attachable) : null;
    const chosen =
      attachments.status === "succeeded" ? attachments.items.filter((i) => i.provider === s.entry.slug).length : 0;
    return (
      <div key={s.entry.slug} className="flex min-h-9 min-w-0 items-center gap-2.5 rounded-lg px-1.5 text-sm hover:bg-accent pointer-coarse:min-h-11">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <ConnectorMark connector={connectorDefinitionFromMcp(s.entry)} className="h-5 w-5" />
        </span>
        {/* A broken connection says so on its own second line, under the
            name — the right side keeps only actions. */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground">{s.entry.name}</span>
          {broken ? (
            <span className="flex min-w-0 items-center gap-1">
              <span title={presentation.reason ?? undefined} className="truncate text-xs text-destructive">
                {presentation.status}
              </span>
              <ErrorAlchemyMenu error={presentation.reason ?? presentation.status} />
            </span>
          ) : null}
        </span>
        {broken ? (
          <>
          <button
            type="button"
            onClick={() => void connect(s.entry)}
            disabled={connectingSlug === s.entry.slug}
            aria-label={`Reconnect ${s.entry.name}`}
            className="flex h-7 shrink-0 items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60 pointer-coarse:h-9"
          >
            {connectingSlug === s.entry.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reconnect"}
          </button>
          </>
        ) : on && chooser ? (
          <button
            type="button"
            onClick={() => {
              onNavigate();
              openAttachPicker({
                conversationId,
                provider: s.entry.slug,
                providerName: s.entry.name,
                attachable: s.attachable,
              });
            }}
            title={chooser}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {chosen > 0 ? `${chosen} chosen ›` : "Choose ›"}
          </button>
        ) : on && toolCount != null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{toolCount} tools</span>
        ) : null}
        <Switch
          checked={on}
          disabled={agentOwned}
          title={agentOwned ? "Part of this agent — it rides every run" : undefined}
          onCheckedChange={(next) => setOn(s.entry.slug, next)}
          aria-label={`${s.entry.name} in this chat`}
          className="shrink-0"
        />
      </div>
    );
  };

  return (
    <>
      <div className="shrink-0 border-b border-border p-1.5">
        <PickerSearchField
          value={query}
          onChange={setQuery}
          placeholder={`Search ${catalog.length || ""} connectors`.replace("  ", " ")}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {availabilityStatus === "failed" && (
          <p className="px-2 py-2 text-xs text-amber-600 dark:text-amber-400">
            Live connection health unavailable. <button type="button" onClick={() => void refreshAvailability()} className="underline">Retry</button> <ErrorAlchemyMenu />
          </p>
        )}
        {active.length > 0 ? <ComposerMenuLabel>Active in this chat</ComposerMenuLabel> : null}
        {active.map((s) => row(s, true))}
        {connectedOff.length > 0 ? <ComposerMenuLabel>Off in this chat</ComposerMenuLabel> : null}
        {connectedOff.map((s) => row(s, false))}
        {catalogStatus === "failed" ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Your connectors did not load.{" "}
            <button type="button" onClick={() => { void dispatch(fetchCatalog()); refreshAvailability(); }} className="font-medium text-primary hover:underline">
              Try again
            </button>
          </p>
        ) : catalogStatus === "loading" && serverStates.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading your connectors…</p>
        ) : active.length === 0 && connectedOff.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {query.trim() ? "No connector by that name is connected yet." : "Nothing is connected yet."}
          </p>
        ) : null}
        <AttachedResourcesSection
          conversationId={conversationId}
          connections={serverStates
            .filter((s) => s.attachable.length > 0 && (s.entry.connectionId !== null || isActive(s.entry.slug)))
            .map((s) => ({ slug: s.entry.slug, name: s.entry.name, attachable: s.attachable }))}
        />
      </div>
      <ComposerMenuRow
        label="Browse all connectors"
        detail={catalog.length > 0 ? String(catalog.length) : undefined}
        chevron
        onClick={() => {
          onNavigate();
          openDirectory();
        }}
      />
    </>
  );
}
