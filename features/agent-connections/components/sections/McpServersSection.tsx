"use client";

import React, { useMemo, useState } from "react";
import { Server, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { GroupSection } from "../GroupSection";
import { ListRow } from "../ListRow";
import { SectionFooter } from "../SectionFooter";
import { useMcpCatalog } from "../../hooks/useMcpCatalog";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { githubConnectUrl } from "@/features/github-integration/service";

type McpStatusTone = "stopped" | "running" | "error";

function statusToneFor(entry: McpCatalogEntry): McpStatusTone {
  const status = entry.connectionStatus ?? "disconnected";
  if (status === "connected") return "running";
  if (status === "error") return "error";
  return "stopped";
}

function statusLabelFor(entry: McpCatalogEntry): string {
  const status = entry.connectionStatus ?? "disconnected";
  if (status === "connected") return "Running";
  if (status === "error") return "Error";
  return "Stopped";
}

export function McpServersSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  const { servers, loading, error } = useMcpCatalog();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.vendor ?? "").toLowerCase().includes(q),
    );
  }, [servers, search]);

  const groups = useMemo(() => {
    const user: McpCatalogEntry[] = [];
    const extensions: McpCatalogEntry[] = [];
    for (const s of filtered) {
      if (s.connectionStatus || s.connectedAt || s.lastUsedAt) {
        user.push(s);
      } else {
        extensions.push(s);
      }
    }
    return [
      { key: "user", label: "User", items: user },
      { key: "extensions", label: "Extensions", items: extensions },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  const selected = selectedItemId
    ? (servers.find((s) => s.serverId === selectedItemId) ?? null)
    : null;

  if (selected) {
    return (
      <McpDetail
        entry={selected}
        onBack={() => dispatch(setSelectedItemId(null))}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        browseLabel="Browse Marketplace"
        showAddButton
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && servers.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading MCP catalog…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search ? "No servers match your search." : "No MCP servers yet."}
          </div>
        ) : (
          groups.map((group) => (
            <GroupSection
              key={group.key}
              label={group.label}
              count={group.items.length}
            >
              {group.items.map((entry) => (
                <ListRow
                  key={entry.serverId}
                  icon={Server}
                  title={entry.name}
                  subtitle={entry.description ?? undefined}
                  status={{
                    label: statusLabelFor(entry),
                    tone: statusToneFor(entry),
                  }}
                  onClick={() => dispatch(setSelectedItemId(entry.serverId))}
                />
              ))}
            </GroupSection>
          ))
        )}
      </div>
      <SectionFooter
        description="An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more."
        learnMoreLabel="Learn more about MCP servers"
        learnMoreHref="#"
      />
    </div>
  );
}

function McpDetail({
  entry,
  onBack,
}: {
  entry: McpCatalogEntry;
  onBack: () => void;
}) {
  const { connect, disconnect, discover } = useMcpCatalog();
  const connected = entry.connectionStatus === "connected";
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">
            {entry.name}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.vendor ?? "Unknown vendor"} · {statusLabelFor(entry)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <button
              type="button"
              onClick={() => disconnect(entry.serverId)}
              className="h-7 px-3 rounded-md text-xs border border-border bg-background hover:bg-accent transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (entry.slug === "github") {
                  window.location.assign(githubConnectUrl(window.location.pathname));
                  return;
                }
                connect({ serverId: entry.serverId });
              }}
              className="h-7 px-3 rounded-md text-xs bg-sky-600 hover:bg-sky-500 text-white transition-colors"
            >
              Connect
            </button>
          )}
          <button
            type="button"
            onClick={() => discover(entry.serverId)}
            disabled={!connected}
            className="h-7 px-3 rounded-md text-xs border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
          >
            Refresh tools
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-3 text-sm">
        {entry.description && (
          <p className="text-sm text-foreground/90">{entry.description}</p>
        )}
        <div className="pt-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Server ID
          </div>
          <code className="text-xs font-mono bg-muted/30 px-2 py-1 rounded">
            {entry.serverId}
          </code>
        </div>
        {entry.lastUsedAt && (
          <div className="pt-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Last used
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(entry.lastUsedAt).toLocaleString()}
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
          Full connection config editor + tool list rendering coming with the
          DetailEditor rollout.
        </p>
      </div>
    </div>
  );
}

export default McpServersSection;
