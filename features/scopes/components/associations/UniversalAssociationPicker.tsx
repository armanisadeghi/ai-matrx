// features/scopes/components/associations/UniversalAssociationPicker.tsx
//
// ONE search box over EVERY listable entity type — "attach anything from
// anywhere". Type a name and results from all tokens stream in, grouped with
// registry icons; click to attach/detach. An optional token chip rail narrows
// to per-token browsing (AssociationCandidateBody — files open the canonical
// FilesResourcePicker, never a plain list).
//
// Fully registry-driven: register a token + one overlay line and it appears
// here with zero changes. Empty query shows the caller's recently-touched
// entities (`platform.user_entity_state`).
//
// THE DOOR LAW, picker flavour: "which one is that?" is THE question a picker
// provokes, so every candidate carries its doors. The row itself stays the
// attach/detach toggle (that is what the user came for, and an <a> inside a
// <button> is invalid DOM anyway), so the doors ride alongside it as SIBLINGS
// via `EntityDoorControls` — peek and new tab only. Same-tab open is
// deliberately withheld here: navigating away would cost the user the picking
// session they are in the middle of.

"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import {
  getEntityInfo,
  curatedTokens,
} from "@/features/scopes/registry/entityRegistry";
import { AssociationCandidateBody } from "./AssociationPicker";
import type { UniversalCandidate } from "@/features/scopes/service/associationCandidates";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface UniversalAssociationPickerProps {
  /** Tokens offered. Defaults to every listable token. */
  tokens?: EntityTypeToken[];
  /** Ids already attached, keyed `${token}:${id}` — rendered as attached. */
  attachedKeys: Set<string>;
  onAttach: (
    token: EntityTypeToken,
    resourceId: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDetach: (
    token: EntityTypeToken,
    resourceId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Owner filter for candidate reads (defaults to RLS-only). */
  ownerId?: string | null;
  /** Org stamped onto rows created via the per-token "+ New" footer. */
  orgId?: string | null;
  className?: string;
}

export function attachedKey(token: string, id: string): string {
  return `${token}:${id}`;
}

export function UniversalAssociationPicker(
  props: UniversalAssociationPickerProps,
) {
  const { attachedKeys, onAttach, onDetach, ownerId, orgId, className } = props;
  const tokens = props.tokens ?? curatedTokens();
  const [query, setQuery] = useState("");
  const [browseToken, setBrowseToken] = useState<EntityTypeToken | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { results, loading, isRecents } = useUniversalEntitySearch({
    query,
    tokens,
    ownerId,
    enabled: browseToken === null,
  });

  const toggle = async (c: UniversalCandidate) => {
    const key = attachedKey(c.token, c.id);
    if (busyKey) return;
    setBusyKey(key);
    try {
      const attached = attachedKeys.has(key);
      const res = attached
        ? await onDetach(c.token, c.id)
        : await onAttach(c.token, c.id, c.title);
      // A silent no-op attach is the bug class this toast kills.
      if (!res.ok) {
        toast.error(
          `Couldn't ${attached ? "detach" : "attach"} "${c.title}"` +
            (res.error ? `: ${res.error}` : ""),
        );
      }
    } finally {
      setBusyKey(null);
    }
  };

  // Group hits by token for section headers (registry icon + plural).
  const groups = new Map<EntityTypeToken, UniversalCandidate[]>();
  for (const r of results) {
    const list = groups.get(r.token) ?? [];
    list.push(r);
    groups.set(r.token, list);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      {/* ── search ──────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (browseToken) setBrowseToken(null);
          }}
          placeholder="Search everything…"
          className="pl-8 text-base"
          style={{ fontSize: 16 }}
        />
        {loading && browseToken === null && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* ── token chip rail (narrow to per-token browse) ─────────────── */}
      <div className="flex flex-wrap gap-1">
        {tokens.map((t) => {
          const info = getEntityInfo(t);
          const active = browseToken === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setBrowseToken(active ? null : t)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <info.Icon className="h-3 w-3" />
              {info.labelPlural}
            </button>
          );
        })}
      </div>

      {/* ── results ──────────────────────────────────────────────────── */}
      {browseToken ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <AssociationCandidateBody
            token={browseToken}
            enabled
            orgId={orgId}
            onClose={() => setBrowseToken(null)}
            attachedIds={
              new Set(
                [...attachedKeys]
                  .filter((k) => k.startsWith(`${browseToken}:`))
                  .map((k) => k.slice(browseToken.length + 1)),
              )
            }
            onAttach={(id, title) => onAttach(browseToken, id, title)}
            onDetach={(id) => onDetach(browseToken, id)}
          />
        </div>
      ) : (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {results.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              {loading
                ? "Searching…"
                : query.trim()
                  ? "No matches — narrow with a type chip to browse."
                  : "No recent items. Type to search, or pick a type to browse."}
            </p>
          ) : (
            <div className="space-y-2">
              {isRecents && (
                <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Recent
                </p>
              )}
              {[...groups.entries()].map(([token, items]) => {
                const info = getEntityInfo(token);
                return (
                  <div key={token} className="space-y-0.5">
                    <p className="flex items-center gap-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      <info.Icon className="h-3 w-3" />
                      {info.labelPlural}
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((c) => {
                        const key = attachedKey(c.token, c.id);
                        const attached = attachedKeys.has(key);
                        const busy = busyKey === key;
                        return (
                          <li
                            key={key}
                            className={cn(
                              "group/entity-ref group flex items-center gap-1 rounded-md pr-1.5 transition-colors",
                              "hover:bg-accent",
                              attached && "bg-accent/40",
                            )}
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggle(c)}
                              title={
                                attached
                                  ? `Detach "${c.title}"`
                                  : `Attach "${c.title}"`
                              }
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                                "disabled:opacity-50",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-foreground">
                                {c.title}
                              </span>
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                  attached
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border text-muted-foreground group-hover:border-primary/60",
                                )}
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : attached ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                              </span>
                            </button>
                            {/* Sibling of the toggle, never a child — an
                                anchor inside a button is invalid DOM. */}
                            <EntityDoorControls
                              token={c.token}
                              id={c.id}
                              name={c.title}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UniversalAssociationPicker;
