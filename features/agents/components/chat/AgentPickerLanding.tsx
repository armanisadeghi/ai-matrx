"use client";

import { useState } from "react";
import { ChevronDown, MessageSquarePlus, Network, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllAgents,
  selectBuiltinAgents,
  selectFavoriteAgents,
  selectOwnedAgents,
  selectSharedWithMeAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectGlobalConversationList } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { FavoriteAgentButton } from "@/features/agents/components/agent-listings/FavoriteAgentButton";

interface AgentPickerLandingProps {
  onSelect: (agentId: string) => void;
}

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
}

const RECENT_LIMIT = 6;

const toRow = (a: {
  id: string;
  name: string;
  description?: string | null;
}): AgentRow => ({
  id: a.id,
  name: a.name || "Untitled agent",
  description: a.description ?? null,
});

function filterRows(rows: AgentRow[], q: string): AgentRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(needle) ||
      (r.description ?? "").toLowerCase().includes(needle),
  );
}

/**
 * Rich agent picker landing for `/chat/new`.
 *
 * Four sections, top to bottom:
 *   - Pinned        — favorited agents (`agx_agent.is_favorite`)
 *   - Recent        — unique agentIds from the user's recent conversations
 *   - My Agents     — owned, non-favorited
 *   - System        — built-in
 *   - Shared        — shared with me
 *
 * Search filters across all sections. Empty sections collapse silently.
 * No manual memoization — React Compiler handles derived values.
 */
export function AgentPickerLanding({ onSelect }: AgentPickerLandingProps) {
  const [query, setQuery] = useState("");

  const pinned = useAppSelector(selectFavoriteAgents);
  const owned = useAppSelector(selectOwnedAgents);
  const builtin = useAppSelector(selectBuiltinAgents);
  const shared = useAppSelector(selectSharedWithMeAgents);
  const conversations = useAppSelector(selectGlobalConversationList);
  const allAgents = useAppSelector(selectAllAgents);

  // Recent agents — unique agentIds from the conversation list (already
  // sorted updated_at DESC), capped to RECENT_LIMIT.
  const seen = new Set<string>();
  const recent: AgentRow[] = [];
  for (const c of conversations) {
    if (!c.agentId || seen.has(c.agentId)) continue;
    const a = allAgents[c.agentId];
    if (!a) continue;
    seen.add(c.agentId);
    recent.push(toRow(a));
    if (recent.length >= RECENT_LIMIT) break;
  }

  const pinnedIds = new Set(pinned.map((p) => p.id));
  const recentIds = new Set(recent.map((r) => r.id));

  // Exclude already-displayed agents from the larger sections to avoid
  // showing the same agent two or three times.
  const dedupe = (rows: AgentRow[]) =>
    rows.filter((r) => !pinnedIds.has(r.id) && !recentIds.has(r.id));

  const pinnedFiltered = filterRows(pinned.map(toRow), query);
  const recentFiltered = filterRows(recent, query);
  const ownedFiltered = filterRows(dedupe(owned.map(toRow)), query);
  const builtinFiltered = filterRows(dedupe(builtin.map(toRow)), query);
  const sharedFiltered = filterRows(dedupe(shared.map(toRow)), query);

  const totalVisible =
    pinnedFiltered.length +
    recentFiltered.length +
    ownedFiltered.length +
    builtinFiltered.length +
    sharedFiltered.length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl w-full px-4 py-6 sm:py-8 flex flex-col gap-4">
        <header className="text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Start a new chat
          </h2>
          <p className="text-xs text-muted-foreground">
            Pick an agent to begin — pinned, recent, or any from your library.
          </p>
        </header>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            aria-label="Search agents"
          />
        </div>

        {totalVisible === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            No agents match “{query}”.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Section title="Pinned" rows={pinnedFiltered} onSelect={onSelect} />
            <Section title="Recent" rows={recentFiltered} onSelect={onSelect} />
            <Section
              title="My Agents"
              rows={ownedFiltered}
              onSelect={onSelect}
            />
            <Section
              title="System"
              rows={builtinFiltered}
              onSelect={onSelect}
            />
            <Section
              title="Shared with me"
              rows={sharedFiltered}
              onSelect={onSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
  onSelect,
  defaultOpen = true,
}: {
  title: string;
  rows: AgentRow[];
  onSelect: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span>{title}</span>
          <span className="text-[10px] text-muted-foreground/70 normal-case tracking-normal">
            {rows.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <ul>
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-t border-border/60 first:border-t-0"
            >
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50"
              >
                <Network className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground truncate">
                    {r.name}
                  </div>
                  {r.description && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.description}
                    </div>
                  )}
                </div>
                <span
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FavoriteAgentButton id={r.id} variant="list" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
