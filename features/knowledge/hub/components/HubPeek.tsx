"use client";

/**
 * The peek (KNOWLEDGE-HUB §5.2, Notion's side peek — the full page in a pane).
 * A kind with a full detail embed (`embeds/embedFor.ts`: web, PDF/file and
 * transcript Sources, conversations, notes) opens its OWN screen under the
 * peek's header, with the light peek one tab away as Details; every other kind
 * gets the light peek.
 *
 * The light peek: for EVERY kind — title,
 * kind and origin, where it is filed (its outward associations), its top
 * Segments, and filing suggestions with one-key accept (A). "Open full" (⌘↵)
 * goes to the item's own route. Esc closes. Each part says plainly when it has
 * nothing, rather than disappearing.
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import { ExternalLink, Lightbulb, Star, X } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { useAssociations, useEntityTitles } from "@ai-matrx/associations/react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { PeekSourceSegments } from "./PeekSourceSegments";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { FiledRef, KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { actionTarget } from "@/features/knowledge/hub/hubActions";
import { tagScopeIdsAmong } from "@/features/knowledge/hub/tags/tagApi";
import { embedFor } from "@/features/knowledge/hub/embeds/embedFor";
import { HubDetailEmbed } from "@/features/knowledge/hub/embeds/HubDetailEmbed";
import {
  capturedByLabel,
  kindIcon,
  kindLabel,
  openFullHref,
  originLabel,
  plainText,
  tokenLabel,
} from "@/features/knowledge/hub/hubPresentation";

interface HubPeekProps {
  hit: KnowledgeHit | null;
  peekKey: string;
  sample: boolean;
  onClose: () => void;
  onOpenFull: (hit: KnowledgeHit) => void;
  onFileUnder: (hit: KnowledgeHit) => void;
  onAcceptSuggestion: (hit: KnowledgeHit, target: FiledRef) => void;
  /** Starred in MY favorites (platform.user_entity_state). */
  isFavorite?: boolean;
  onToggleFavorite?: (hit: KnowledgeHit) => void;
  /** Triage and Tag buttons (features/knowledge/hub/triage, tags). */
  extraActions?: React.ReactNode;
  /** The name the row shows when the record's own title is a placeholder ("unlabeled"). */
  displayTitle?: string | null;
  /** The Tags section (chips; click = filter). */
  tagsSection?: React.ReactNode;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function FiledChip({ f }: { f: FiledRef }) {
  const info = tryGetEntityInfo(f.type);
  const Icon = info?.Icon;
  const href = info?.hrefFor?.(f.id);
  const body = (
    <>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate">{f.name || "Untitled"}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{tokenLabel(f.type)}</span>
    </>
  );
  const cls =
    "flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs";
  return href ? (
    <a href={href} className={`${cls} hover:bg-accent`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Live outward associations for a real record. */
function LiveFiledUnder({ entity, id }: { entity: string; id: string }) {
  const { edges, status, error } = useAssociations({ type: entity, id });
  // Tags have their own section above: a tag is not also "filed under" here.
  const scopeIds = edges.filter((e) => e.direction === "outgoing" && e.otherType === "scope").map((e) => e.otherId);
  const scopeKey = scopeIds.sort().join("|");
  const [tagIds, setTagIds] = useState<Set<string> | null>(scopeIds.length ? null : new Set());
  useEffect(() => {
    let cancelled = false;
    if (!scopeKey) {
      setTagIds(new Set());
      return;
    }
    tagScopeIdsAmong(scopeKey.split("|"))
      .then((ids) => !cancelled && setTagIds(ids))
      .catch(() => !cancelled && setTagIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);
  const outgoing = edges.filter((e) => e.direction === "outgoing" && !(e.otherType === "scope" && tagIds?.has(e.otherId)));
  const { titleFor } = useEntityTitles(
    outgoing.map((e) => ({ token: e.otherType, id: e.otherId, label: e.label })),
  );
  if (status === "loading" || status === "idle" || tagIds === null)
    return <p className="text-xs text-muted-foreground">Reading where it is filed…</p>;
  if (status === "error")
    return (
      <p className="text-xs text-destructive">
        {error ?? "Could not read where it is filed."}
        <ErrorAlchemyMenu error={error ?? "Could not read where it is filed."} size="xs" />
      </p>
    );
  if (!outgoing.length) return <p className="text-xs text-muted-foreground">Not filed</p>;
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {outgoing.map((e) => (
        <FiledChip
          key={e.id}
          f={{ type: e.otherType, id: e.otherId, name: titleFor({ token: e.otherType, id: e.otherId, label: e.label }) }}
        />
      ))}
    </div>
  );
}

export function HubPeek({
  hit,
  peekKey,
  sample,
  onClose,
  onOpenFull,
  onAcceptSuggestion,
  isFavorite = false,
  onToggleFavorite,
  extraActions,
  displayTitle,
  tagsSection,
}: HubPeekProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"page" | "details">("page");
  if (!hit) {
    const [entity, id] = [peekKey.slice(0, peekKey.indexOf(":")), peekKey.slice(peekKey.indexOf(":") + 1)];
    const href = tryGetEntityInfo(entity)?.hrefFor?.(id) ?? null;
    return (
      <aside className="flex h-full flex-col gap-3 p-4" aria-label="Peek">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">This item is not in the current results.</span>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close peek (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {href ? (
          <a className="text-sm underline" href={href}>
            Open it on its own page
          </a>
        ) : null}
      </aside>
    );
  }
  const Icon = kindIcon(hit);
  const target = actionTarget(hit);
  // Browsing (nothing typed): a Source's "Top segments" are its OWN first
  // Segments, read from the Source — no search term means no passage matched.
  const browsing = !(searchParams?.get("q") ?? "").trim();
  const readFromSource = browsing && !sample && target.entity === "processed_document";
  const href = openFullHref(hit);
  const segments =
    hit.entity === "segment" && hit.snippet
      ? [{ id: hit.id, text: hit.snippet, locator: hit.segment?.locator ?? null }]
      : (hit.top_segments ?? []);
  const when = hit.updated_at ?? hit.created_at;
  // Sample data has no real records behind it: its items keep the light peek.
  const embed = sample ? null : embedFor(hit);
  const lightBody = (
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        {hit.snippet && hit.entity !== "segment" ? (
          <p className="text-sm leading-relaxed text-foreground/90">{hit.snippet}</p>
        ) : null}

        {tagsSection}

        <section>
          <Heading>Filed under</Heading>
          {sample ? (
            hit.filed_under?.length ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {hit.filed_under.map((f) => (
                  <FiledChip key={`${f.type}:${f.id}`} f={f} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not filed</p>
            )
          ) : (
            <LiveFiledUnder entity={target.entity} id={target.id} />
          )}
        </section>

        {/* Passages belong to Sources: other kinds have no such section. */}
        {readFromSource || segments.length || target.entity === "processed_document" ? (
          <section>
            <Heading>{readFromSource ? "First segments" : "Top segments"}</Heading>
            {readFromSource ? (
              <PeekSourceSegments sourceId={target.id} />
            ) : segments.length ? (
              <ul className="space-y-2">
                {segments.map((g) => (
                  <li key={g.id} className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm">
                    <p className="leading-relaxed">{g.text}</p>
                    {g.locator ? <p className="pt-1 text-[11px] text-muted-foreground">{g.locator}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No passages</p>
            )}
          </section>
        ) : null}

        {hit.suggestions?.length ? (
          <section>
            <Heading>Suggestions</Heading>
            <ul className="space-y-1.5">
              {hit.suggestions.map((s, i) => (
                <li
                  key={`${s.target.type}:${s.target.id}`}
                  className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm"
                >
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p>
                      File under <strong>{s.target.name ?? "Untitled"}</strong>{" "}
                      <span className="text-xs text-muted-foreground">({tokenLabel(s.target.type)})</span>?
                    </p>
                    {s.reason ? <p className="text-xs text-muted-foreground">{s.reason}</p> : null}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1" onClick={() => onAcceptSuggestion(hit, s.target)}>
                    Accept
                    {i === 0 ? <kbd className="rounded border border-border px-1 text-[10px]">A</kbd> : null}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <Heading>Details</Heading>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Captured by</dt>
            <dd>{capturedByLabel(hit)}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{hit.created_at ? formatRelativeTime(hit.created_at) : "Not reported"}</dd>
            <dt className="text-muted-foreground">Mentions</dt>
            <dd>{hit.entities?.length ? hit.entities.join(", ") : "None reported"}</dd>
          </dl>
        </section>
      </div>
  );
  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={`Peek: ${hit.title}`}>
      {/* One header line (Linear's issue peek): what it is, then Open, Favorite, the row menu
          (Keep, Archive, Tag, File to, Copy, Trash — the same menu the row carries), Close. */}
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">{displayTitle || plainText(hit.title)}</h2>
          <p className="text-xs text-muted-foreground">
            {[kindLabel(hit), hit.origin ? originLabel(hit.origin) : null, when ? formatRelativeTime(when) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {href ? (
            <Button size="sm" variant="default" className="h-7 gap-1.5 px-2.5" title="Open (⌘↵)" onClick={() => onOpenFull(hit)}>
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          ) : null}
          {onToggleFavorite ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              onClick={() => onToggleFavorite(hit)}
            >
              <Star className={isFavorite ? "h-4 w-4 fill-amber-400 text-amber-500" : "h-4 w-4"} />
            </Button>
          ) : null}
          {extraActions}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose} aria-label="Close peek (Esc)" title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {embed ? (
        <>
          <div className="max-h-24 shrink-0 overflow-y-auto border-b border-border px-4 py-2">
            <Heading>Filed under</Heading>
            <LiveFiledUnder entity={target.entity} id={target.id} />
          </div>
          <div className="flex shrink-0 gap-1 border-b border-border px-3 py-1" role="tablist" aria-label="Peek view">
            {(["page", "details"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={
                  tab === t
                    ? "h-7 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground"
                    : "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                }
              >
                {t === "page" ? "Page" : "Details"}
              </button>
            ))}
          </div>
          {tab === "page" ? (
            <div className="min-h-0 flex-1 overflow-hidden" data-testid="hub-peek-embed" data-embed-kind={embed.kind}>
              <HubDetailEmbed embed={embed} />
            </div>
          ) : (
            lightBody
          )}
        </>
      ) : (
        lightBody
      )}
    </aside>
  );
}
