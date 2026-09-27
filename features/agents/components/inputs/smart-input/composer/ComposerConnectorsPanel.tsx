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
 * per-chat on/off is the SAME `addedMcpServers` write the Tools picker makes,
 * reconnect is `useConnectMcpServer`, choosing repositories / files is the ONE
 * attach picker, and the directory is the live integrations window. An agent's
 * own connectors ride every run of that agent — their switch is on and fixed.
 */

import { useState } from "react";
import { Loader2, Paperclip, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useMcpCatalog, type McpServerState } from "@/features/agents/hooks/useMcpTools";
import { selectAgentMcpServers } from "@/features/agents/redux/agent-definition/selectors";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { useConnectMcpServer } from "@/features/connectors/useConnectMcpServer";
import { attachActionLabel } from "@/features/connectors/attachable-resources";
import { useAttachResourcePicker } from "@/features/connectors/useAttachResourcePicker";
import { useConversationAttachments } from "@/features/connectors/useConversationAttachments";
import { useOpenLiveIntegrationsWindow } from "@/features/overlays/openers/liveIntegrationsWindow";
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
  const { serverStates, catalog, status: catalogStatus, refreshAvailability } = useMcpCatalog();
  const { connect, connectingSlug } = useConnectMcpServer();
  const openAttachPicker = useAttachResourcePicker();
  const openDirectory = useOpenLiveIntegrationsWindow();
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentServers = useAppSelector((state) => (agentId ? selectAgentMcpServers(state, agentId) : undefined));
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
      (s.entry.connectionId !== null || s.truth.state === "needs_reauth") &&
      matches(s),
  );

  const setOn = (slug: string, on: boolean) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedMcpServers: on ? [...added, slug] : added.filter((s) => s !== slug) },
      }),
    );

  const row = (s: McpServerState, on: boolean) => {
    const broken = s.truth.state === "needs_reauth";
    const agentOwned = agentSlugs.has(s.entry.slug);
    const chooser = s.attachable.length > 0 ? attachActionLabel(s.attachable) : null;
    const chosen =
      attachments.status === "succeeded" ? attachments.items.filter((i) => i.provider === s.entry.slug).length : 0;
    return (
      <div key={s.entry.slug} className="flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-accent">
        <ConnectorMark name={s.entry.name} iconUrl={s.entry.iconUrl} />
        <span className="min-w-0 flex-1 truncate text-foreground">{s.entry.name}</span>
        {broken ? (
          <button
            type="button"
            onClick={() => void connect(s.entry)}
            disabled={connectingSlug === s.entry.slug}
            className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-60"
          >
            {connectingSlug === s.entry.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reconnect"}
          </button>
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
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            {chosen > 0 ? `${chosen} chosen ›` : "Choose ›"}
          </button>
        ) : on && s.toolCount != null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.toolCount} tools</span>
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
      <div className="flex h-9 items-center gap-2 px-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${catalog.length || ""} connectors`.replace("  ", " ")}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-[50dvh] overflow-y-auto">
        {active.length > 0 ? <ComposerMenuLabel>Active in this chat</ComposerMenuLabel> : null}
        {active.map((s) => row(s, true))}
        {connectedOff.length > 0 ? <ComposerMenuLabel>Connected · off in this chat</ComposerMenuLabel> : null}
        {connectedOff.map((s) => row(s, false))}
        {catalogStatus === "failed" ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">
            Your connectors did not load.{" "}
            <button type="button" onClick={() => void refreshAvailability()} className="font-medium text-primary hover:underline">
              Try again
            </button>
          </p>
        ) : catalogStatus === "loading" && serverStates.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading your connectors…</p>
        ) : active.length === 0 && connectedOff.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">
            {query.trim() ? "No connector by that name is connected yet." : "Nothing is connected yet."}
          </p>
        ) : null}
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

/** The connector's own mark, else its initials — never a generic icon standing in for a brand. */
function ConnectorMark({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="h-5 w-5 shrink-0 rounded" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground")}
    >
      {initials}
    </span>
  );
}
