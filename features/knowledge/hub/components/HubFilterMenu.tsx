"use client";

/**
 * The filter menu (`f`, Linear): every facet the hub offers — kind, origin,
 * captured by, filed under, entities, date, state, sort — as one searchable
 * command list. Counts come from the design system's facet math over the rows
 * already loaded; when those rows are not the whole answer the group says so
 * in a sentence (`describeFacetSource`), never passing a partial count off as
 * the total. Choosing a value toggles it on the ONE query (and the URL).
 */

import Link from "next/link";
import { Check, FlaskConical } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ai-matrx/design-system";
import {
  computeColumnFacets,
  describeFacetSource,
  localFacetsAreComplete,
} from "@ai-matrx/design-system/data-table/facets";
import { applyChips, removeChip, type QueryChip } from "@/features/knowledge/api/knowledgeQueryText";
import type { KnowledgeHit, KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import { HUB_KINDS } from "@/features/knowledge/hub/hubState";
import {
  ORIGIN_WORDS,
  capturedByLabel,
  kindLabel,
  originLabel,
  tokenLabel,
} from "@/features/knowledge/hub/hubPresentation";
import { RELATIVE_DATE_LABEL } from "@/features/knowledge/api/knowledgeQueryText";
import { hitTags } from "@/features/knowledge/hub/tags/tagActions";
import { searchLabHref } from "@/features/knowledge/hub/legacyRoutes";
import { HUB_STAGES, HUB_STAGE_LABEL, type HubStage } from "@/features/knowledge/hub/hubStage";

interface HubFilterMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: KnowledgeQuery;
  onQueryChange: (next: KnowledgeQuery) => void;
  /** Rows currently loaded (for counts). */
  hits: KnowledgeHit[];
  /** Total matches across sections, when every lane counted. */
  total: number | undefined;
  /** The Stage facet (Sources only; narrows the loaded items). */
  stage?: {
    selected: readonly HubStage[];
    counts: Record<HubStage, number>;
    onToggle: (stage: HubStage) => void;
    /** Said under the group when the loaded items are not the whole answer. */
    note?: string | null;
  };
  children: React.ReactNode;
}

function countMulti(hits: KnowledgeHit[], read: (h: KnowledgeHit) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of hits) for (const v of new Set(read(h))) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function FilterItem({
  value,
  label,
  count,
  on,
  chip,
  onToggle,
}: {
  value: string;
  label: string;
  count?: number;
  on: boolean;
  chip: QueryChip;
  onToggle: (chip: QueryChip, on: boolean) => void;
}) {
  return (
    <CommandItem value={value} onSelect={() => onToggle(chip, on)}>
      <Check className={on ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-0"} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </CommandItem>
  );
}

const DATE_OPTIONS = ["today", "yesterday", "last_7_days", "last_30_days", "this_year"] as const;

export function HubFilterMenu({
  open,
  onOpenChange,
  query,
  onQueryChange,
  hits,
  total,
  stage,
  children,
}: HubFilterMenuProps) {
  const complete = localFacetsAreComplete(hits.length, total);
  const facet = (columnId: string, read: (h: KnowledgeHit) => unknown) =>
    computeColumnFacets({
      columnId,
      rows: hits,
      readValue: (row) => read(row as KnowledgeHit),
      complete,
      limit: 30,
    });
  const origin = facet("origin", (h) => h.origin ?? "");
  const byKind = facet("kind", (h) => kindLabel(h));
  const capturedBy = facet("captured_by", (h) => capturedByLabel(h));
  const filed = countMulti(hits, (h) => (h.filed_under ?? []).map((f) => `${f.type}\u0000${f.id}\u0000${f.name ?? ""}`));
  const entities = countMulti(hits, (h) => h.entities ?? []);
  const tags = countMulti(hits, hitTags);
  const partialNote = describeFacetSource(origin, "items");

  const toggle = (chip: QueryChip, on: boolean) =>
    onQueryChange(on ? removeChip(query, chip) : applyChips(query, [chip]));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        /* sizing: fixed — a searchable filter command list; a steady width keeps the list from jumping as the query narrows it */
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder="Filter by…" autoFocus />
          {partialNote ? (
            <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">{partialNote}</p>
          ) : null}
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No filter matches.</CommandEmpty>
            <CommandGroup heading="Kind">
              {HUB_KINDS.map((k) => {
                const isSource = Boolean(k.query.source_kinds);
                const value = (k.query.source_kinds ?? k.query.types ?? [])[0];
                const chip: QueryChip = isSource
                  ? { kind: "source_kind", value }
                  : { kind: "type", value };
                const on = isSource
                  ? (query.source_kinds ?? []).includes(value)
                  : (query.types ?? []).includes(value);
                const count = byKind.values.find((v) => v.value === k.label)?.count;
                return <FilterItem onToggle={toggle} key={k.key} value={`kind ${k.label}`} label={k.label} count={count} on={on} chip={chip} />;
              })}
            </CommandGroup>
            <CommandGroup heading="Origin">
              {Object.keys(ORIGIN_WORDS).map((o) => (
                <FilterItem
                  onToggle={toggle}
                  key={o}
                  value={`origin ${originLabel(o)}`}
                  label={originLabel(o)}
                  count={origin.values.find((v) => v.value === o)?.count}
                  on={(query.origin ?? []).includes(o)}
                  chip={{ kind: "origin", value: o }}
                />
              ))}
            </CommandGroup>
            <CommandGroup heading="Captured by">
              <FilterItem
                  onToggle={toggle}
                value="captured by me"
                label="Me"
                count={capturedBy.values.find((v) => v.value === "You")?.count}
                on={query.captured_by === "me"}
                chip={{ kind: "captured_by", value: "me" }}
              />
              <FilterItem
                  onToggle={toggle}
                value="captured by anyone"
                label="Anyone"
                on={query.captured_by === "anyone"}
                chip={{ kind: "captured_by", value: "anyone" }}
              />
            </CommandGroup>
            <CommandGroup heading="Filed under">
              {[...filed.entries()].slice(0, 30).map(([k, count]) => {
                const [type, id, name] = k.split("\u0000");
                const ref = { type, id };
                const on = (query.within ?? []).some((w) => w.type === type && w.id === id);
                return (
                  <FilterItem
                  onToggle={toggle}
                    key={k}
                    value={`filed ${name} ${tokenLabel(type)}`}
                    label={`${name || "Untitled"} · ${tokenLabel(type)}`}
                    count={count}
                    on={on}
                    chip={{ kind: "within", ref }}
                  />
                );
              })}
              {filed.size === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  None of the loaded items report where they are filed.
                </p>
              ) : null}
            </CommandGroup>
            <CommandGroup heading="Tags">
              {[...tags.entries()].slice(0, 30).map(([t, count]) => (
                <FilterItem
                  onToggle={toggle}
                  key={t}
                  value={`tag #${t}`}
                  label={`#${t}`}
                  count={count}
                  on={(query.within ?? []).some((w) => w.type === "tag" && (w.name ?? "").toLowerCase() === t.toLowerCase())}
                  chip={{ kind: "within", ref: { type: "tag", name: t } }}
                />
              ))}
              {tags.size === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  None of the loaded items are tagged. Press t on an item to tag it.
                </p>
              ) : null}
            </CommandGroup>
            <CommandGroup heading="People, places, organizations">
              {[...entities.entries()].slice(0, 30).map(([e, count]) => (
                <FilterItem
                  onToggle={toggle}
                  key={e}
                  value={`entity ${e}`}
                  label={e}
                  count={count}
                  on={(query.entities ?? []).includes(e)}
                  chip={{ kind: "entity", value: e }}
                />
              ))}
              {entities.size === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  None of the loaded items report extracted names.
                </p>
              ) : null}
            </CommandGroup>
            {stage ? (
              <CommandGroup heading="Stage (Sources)">
                {HUB_STAGES.map((st) => {
                  const on = stage.selected.includes(st);
                  return (
                    <CommandItem key={st} value={`stage ${HUB_STAGE_LABEL[st]}`} onSelect={() => stage.onToggle(st)}>
                      <Check className={on ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-0"} />
                      <span className="min-w-0 flex-1 truncate">{HUB_STAGE_LABEL[st]}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{stage.counts[st]}</span>
                    </CommandItem>
                  );
                })}
                {stage.note ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{stage.note}</p> : null}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Updated">
              {DATE_OPTIONS.map((d) => (
                <FilterItem
                  onToggle={toggle}
                  key={d}
                  value={`date ${RELATIVE_DATE_LABEL[d]}`}
                  label={RELATIVE_DATE_LABEL[d]}
                  on={query.date?.relative === d}
                  chip={{ kind: "date", value: { field: "updated", relative: d } }}
                />
              ))}
            </CommandGroup>
            <CommandGroup heading="State">
              {(["inbox", "kept", "archived"] as const).map((s) => (
                <FilterItem
                  onToggle={toggle}
                  key={s}
                  value={`state ${s}`}
                  label={s === "inbox" ? "Inbox" : s === "kept" ? "Kept" : "Archived"}
                  on={(query.state ?? []).includes(s)}
                  chip={{ kind: "state", value: s }}
                />
              ))}
            </CommandGroup>
            <CommandGroup heading="Sort">
              {(["relevance", "recent", "title"] as const).map((s) => (
                <FilterItem
                  onToggle={toggle}
                  key={s}
                  value={`sort ${s}`}
                  label={s === "relevance" ? "Best match" : s === "recent" ? "Most recent" : "Title A–Z"}
                  on={(query.sort ?? (query.text ? "relevance" : "recent")) === s}
                  chip={{ kind: "sort", value: s }}
                />
              ))}
            </CommandGroup>
          </CommandList>
          {/* The Search Lab is where a person sees HOW retrieval found and ranked results (Arman, 2026-09-29). */}
          <Link
            href={searchLabHref(query)}
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">Test retrieval — see how this search is found and ranked in the Search Lab</span>
          </Link>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
