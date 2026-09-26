"use client";

// features/ai-work/conversations/components/ConversationAudienceFilter.tsx
//
// THE TOP OF THE LIST: the three buckets a person thinks in, then the second
// cut inside the chosen bucket.
//
//   AI chats · External app runs · Internal Matrx runs         (+ All)
//   └ inside External: Claude Code · Codex · Cursor · VS Code (the TOOL —
//                      source_feature under source_app 'code-plugin')
//   └ inside AI chats: Matrx · Chrome extension · Desktop · …
//   └ inside Internal: Subagent run · Workflow run · Scheduled run · …
//
// Every chip carries a TRUE count from the facets query — the same query that
// feeds the Filters panel — and clicking it writes the ordinary filter bag
// (`audience`, then `source_app` / `source_feature` / `conversation_type`), so nothing here is a
// private second filtering path that could disagree with a column header.
//
// The bucket itself is derived on the server (`public.cvx_audience`); this
// component only names it. See ../types.ts for the ruling and the rule.

import { Cpu, Layers, MessageSquare, TerminalSquare } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  facetCount,
  facetValues,
  type EntityFacets,
} from "@/lib/entity-list/types";
import type { EntityListController } from "@/lib/entity-list/config";
import { appLabel } from "@/features/agents/redux/conversation-history/source-registry";
import { codePluginFeatureLabel } from "@/features/ai-work/lib/providerSource";
import { audienceLabel, conversationTypeLabel } from "../presentation";
import {
  applyAudience,
  CONVERSATION_AUDIENCES,
  readAudience,
  type ConversationAudienceId,
  type ConversationBrowseRow,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const BUCKET_ICONS: Record<ConversationAudienceId, typeof Cpu> = {
  chat: MessageSquare,
  external: TerminalSquare,
  internal: Cpu,
};

const BUCKET_HINTS: Record<ConversationAudienceId, string> = {
  chat: "Conversations you started yourself — chat, agent runs, builds, the extension, the desktop.",
  external:
    "Sessions mirrored from an outside coding app — Claude Code, Codex, Cursor, VS Code.",
  internal:
    "Runs the platform started for itself while the app works — subagents, workflow steps, scheduled jobs, podcast builds, research sweeps, page-automatic runs.",
};

type CutFilterId = "source_app" | "source_feature" | "conversation_type";

interface CutFamily {
  facet: string;
  filterId: CutFilterId;
  format: (value: string) => string;
  noneLabel: string;
}

/**
 * The second cut for one bucket: which facet families, which filter each
 * writes, and how a raw value is named. Counts come from the bucket-scoped
 * facet families (`audience_source_app`, `audience_source_feature`,
 * `audience_conversation_type`) so the number on a chip is the number of rows
 * in THIS bucket, not corpus-wide.
 *
 * External is cut by TOOL: every outside coding tool is source_app
 * 'code-plugin' (Arman, 2026-09-18), so its tool lives in source_feature and
 * the chip writes the `source_feature` filter. An external row some other app
 * stamped (bound to a coding session) still cuts by its app.
 */
function secondCut(bucket: ConversationAudienceId): CutFamily[] {
  if (bucket === "internal") {
    return [
      {
        facet: "audience_conversation_type",
        filterId: "conversation_type",
        format: conversationTypeLabel,
        noneLabel: "Untyped",
      },
    ];
  }
  const byApp: CutFamily = {
    facet: "audience_source_app",
    filterId: "source_app",
    format: appLabel,
    noneLabel: "No app recorded",
  };
  if (bucket === "external") {
    return [
      {
        facet: "audience_source_feature",
        filterId: "source_feature",
        format: codePluginFeatureLabel,
        noneLabel: "No tool recorded",
      },
      byApp,
    ];
  }
  return [byApp];
}

function chipClass(selected: boolean): string {
  return cn(
    "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors",
    selected
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

function bucketTotal(facets: EntityFacets, bucket: ConversationAudienceId) {
  return facetCount(facets, "audience", bucket);
}

export function ConversationAudienceFilter({
  list,
}: {
  list: EntityListController<ConversationBrowseRow>;
}) {
  const active = readAudience(list.query.filters);
  const facetsReady = !list.facetsLoading && !list.facetsError;
  const everything = CONVERSATION_AUDIENCES.reduce(
    (total, bucket) => total + bucketTotal(list.facets, bucket),
    0,
  );

  // The second cut is only offered inside ONE bucket; with "All" or a custom
  // bag there is no bucket to cut.
  const bucket =
    active === "all" || active === "custom"
      ? null
      : (active as ConversationAudienceId);
  const cut = bucket ? secondCut(bucket) : [];
  // A facet response belongs to its exact query. Do not leave second-cut chips
  // visible with cached counts while the bucket/search/scope changes.
  const cutOptions = facetsReady
    ? cut.flatMap((family) =>
        facetValues(list.facets, family.facet)
          .filter((option) => option.value.startsWith(`${bucket}:`))
          .map((option) => ({
            family,
            value: option.value.slice(bucket!.length + 1),
            count: option.count,
          })),
      )
    : [];
  const selectedIn = (filterId: CutFilterId): Set<string> => {
    const filter = list.query.filters[filterId];
    return filter && filter.kind === "select"
      ? new Set(filter.values)
      : new Set<string>();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="w-full overflow-x-auto pb-1 sm:w-auto">
          <div
            className="inline-flex min-w-max items-center rounded-md border border-border bg-card p-0.5"
            role="group"
            aria-label="Which conversations to show"
          >
            {CONVERSATION_AUDIENCES.map((id) => {
              const Icon = BUCKET_ICONS[id];
              const selected = active === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={BUCKET_HINTS[id]}
                  aria-pressed={selected}
                  onClick={() =>
                    list.setFilters(applyAudience(list.query.filters, id))
                  }
                  className={chipClass(selected)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{audienceLabel(id)}</span>
                  {/* A count IS a door: the number is how the user knows what a
                    bucket holds, and clicking it is how they reach it. */}
                  <span className="tabular-nums opacity-70">
                    {facetsReady
                      ? bucketTotal(list.facets, id).toLocaleString()
                      : list.facetsLoading
                        ? "Loading…"
                        : "Unavailable"}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              title="Every conversation in every bucket."
              aria-pressed={active === "all"}
              onClick={() =>
                list.setFilters(applyAudience(list.query.filters, "all"))
              }
              className={chipClass(active === "all")}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>All</span>
              <span className="tabular-nums opacity-70">
                {facetsReady
                  ? everything.toLocaleString()
                  : list.facetsLoading
                    ? "Loading…"
                    : "Unavailable"}
              </span>
            </button>
          </div>
        </div>
        {list.facetsError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span>Audience counts are unavailable: {list.facetsError}</span>
            <button
              type="button"
              onClick={list.refresh}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Retry
            </button>
            <ErrorAlchemyMenu />
          </div>
        )}
        {active === "custom" && (
          <span className="text-xs text-muted-foreground">
            Custom bucket filter applied — the presets above replace it.
          </span>
        )}
      </div>

      {cutOptions.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label={
            bucket === "internal"
              ? "Which kind of run"
              : bucket === "external"
                ? "Which tool"
                : "Which app"
          }
        >
          {cutOptions.map((option) => {
            const { family } = option;
            const familySelected = selectedIn(family.filterId);
            const selected = familySelected.has(option.value);
            const label =
              option.value === "__none__"
                ? family.noneLabel
                : family.format(option.value);
            return (
              <button
                key={`${family.filterId}:${option.value}`}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  // One chip = one value. Clicking the selected chip clears the
                  // cut (back to the whole bucket); clicking another replaces it.
                  // A chip from one family replaces a chip from the other
                  // (tool vs app), so every family's filter is cleared first.
                  const next = { ...list.query.filters };
                  for (const other of cut) delete next[other.filterId];
                  if (!(selected && familySelected.size === 1)) {
                    next[family.filterId] = {
                      kind: "select",
                      values: [option.value],
                    };
                  }
                  list.setFilters(next);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{label}</span>
                <span className="tabular-nums opacity-70">
                  {option.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
