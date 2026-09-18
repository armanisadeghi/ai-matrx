"use client";

// features/marketing/seo/topical-map/views/pages/bulk/IntentTargetPicker.tsx
//
// WHERE THE PAGES ARE GOING — the inside of every bulk popover that needs a
// destination, and the one place this screen can MAKE the destination it wants.
//
// Three segments, each shown only when the action needs it:
//
//   TOPIC        `seo.search_map_topics`. Only LIVE topics come back, which is
//                the point: a retired or rejected slug is P0002 from every
//                writer, so a picker that offered one would be offering a
//                destination that cannot be written.
//   LIVE PAGE    a substring search over the pages this map already knows.
//   PLANNED PAGE "Make a planned page here" — a `plan.node` under the chosen
//                topic, so an intent can point at a page that does not exist
//                yet. It is the answer to "redirect these 200 pages to a page
//                we have not written", which otherwise dead-ends.
//
// Every chosen record is rendered as an `EntityRef`, so the person can open it
// before committing 200 pages to it (THE DOOR LAW).

import { useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";

// `components/ui/input.tsx` is host residue that exports only the Copy/Fancy/
// Delete wrappers; the plain `Input` lives in the package, which is where every
// other marketing picker takes it from.
import { Input } from "@ai-matrx/design-system";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCreatePlanNode } from "@/features/marketing/content-plan/data/hooks";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { convertToKebabCase } from "@/utils/text/stringUtils";

import { topicalMapErrorText } from "../../../errors";
import { useMapTopicRows, useMapTopicSearch, usePageIntents } from "../../../hooks";
import type { PagesWorkspaceContext } from "../seams";
import type { BulkIntentDraft } from "./useBulkIntentFlow";

/** A page search says nothing useful under two characters; it says so instead. */
const PAGE_SEARCH_MIN_CHARS = 2;
/** The pages this picker searches over. The read is paged; this is one page of it. */
const PAGE_SEARCH_LIMIT = 50;
/** Topic hits shown at once — enough to choose from, short enough to read. */
const TOPIC_SEARCH_LIMIT = 20;

export interface IntentTargetPickerProps {
  context: PagesWorkspaceContext;
  /** move / merge / redirect — the topic is required and the picker says so. */
  needsTopic: boolean;
  /**
   * keep / rewrite / delete — the topic is OPTIONAL and only offered when some
   * selected page covers nothing, because that is the only case where the
   * writer has nothing to derive it from.
   */
  offersTopicOverride: boolean;
  /** merge / redirect — a live page or a planned one. */
  needsTarget: boolean;
  /** The distinct sites the selected rows belong to. A plan node belongs to one. */
  selectionSiteIds: readonly string[];
  draft: BulkIntentDraft;
  onChange: (draft: BulkIntentDraft) => void;
}

export function IntentTargetPicker({
  context,
  needsTopic,
  offersTopicOverride,
  needsTarget,
  selectionSiteIds,
  draft,
  onChange,
}: IntentTargetPickerProps) {
  const showTopic = needsTopic || offersTopicOverride;
  return (
    <div className="flex flex-col gap-2">
      {showTopic ? (
        <TopicSegment
          context={context}
          required={needsTopic}
          draft={draft}
          onChange={onChange}
        />
      ) : null}
      {needsTarget ? (
        <>
          <LivePageSegment context={context} draft={draft} onChange={onChange} />
          <PlannedPageSegment
            context={context}
            selectionSiteIds={selectionSiteIds}
            draft={draft}
            onChange={onChange}
          />
        </>
      ) : null}
    </div>
  );
}

function SegmentLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/** A sentence a control shows in place of itself when it cannot act. */
function CannotOffer({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function TopicSegment({
  context,
  required,
  draft,
  onChange,
}: {
  context: PagesWorkspaceContext;
  required: boolean;
  draft: BulkIntentDraft;
  onChange: (draft: BulkIntentDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = useMapTopicSearch(context.mapId, query, TOPIC_SEARCH_LIMIT);

  return (
    <div className="flex flex-col gap-1">
      <SegmentLabel>
        {required ? "Topic (required)" : "Topic for the pages that cover none"}
      </SegmentLabel>
      {draft.topicSlug ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1">
          <span className="min-w-0 truncate text-xs text-foreground">
            {draft.topicName ?? draft.topicSlug}
            <span className="ml-1 font-mono text-[11px] text-muted-foreground">
              {draft.topicSlug}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() =>
              onChange({ ...draft, topicSlug: null, topicName: null })
            }
          >
            Change
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search live topics"
              aria-label="Search live topics"
              className="h-7 pl-7 text-xs"
            />
          </div>
          {hits.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {topicalMapErrorText(hits.error)}
            </p>
          ) : hits.isPending ? (
            <CannotOffer>Looking for topics…</CannotOffer>
          ) : (
            <Command shouldFilter={false} className="rounded-md border border-border">
              <CommandList className="max-h-40">
                <CommandEmpty className="px-2 py-2 text-xs text-muted-foreground">
                  No live topic of this map matches. Retired and rejected topics
                  are never offered — no writer accepts one.
                </CommandEmpty>
                <CommandGroup>
                  {hits.data.map((hit) => (
                    <CommandItem
                      key={hit.slug}
                      value={hit.slug}
                      className="flex-col items-start gap-0 py-1"
                      onSelect={() =>
                        onChange({
                          ...draft,
                          topicSlug: hit.slug,
                          topicName: hit.name,
                        })
                      }
                    >
                      <span className="text-xs text-foreground">{hit.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {hit.path.join(" › ")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </>
      )}
    </div>
  );
}

function LivePageSegment({
  context,
  draft,
  onChange,
}: {
  context: PagesWorkspaceContext;
  draft: BulkIntentDraft;
  onChange: (draft: BulkIntentDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const ready = query.trim().length >= PAGE_SEARCH_MIN_CHARS;
  // The read is only mounted once the person has typed something to match, so
  // an idle popover costs nothing.
  const pages = usePageIntents(
    context.mapId,
    { siteId: context.siteId, limit: PAGE_SEARCH_LIMIT },
    ready,
  );

  const needle = query.trim().toLowerCase();
  const matches = ready && pages.data
    ? pages.data.items.filter((item) =>
        (item.page.url ?? item.page.label ?? "").toLowerCase().includes(needle),
      )
    : [];

  return (
    <div className="flex flex-col gap-1">
      <SegmentLabel>Live page</SegmentLabel>
      {draft.intoPageId ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1">
          <EntityRef
            token="web_page"
            id={draft.intoPageId}
            name={draft.intoPageLabel}
            openInNewTab
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() =>
              onChange({ ...draft, intoPageId: null, intoPageLabel: null })
            }
          >
            Change
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this map's pages by URL"
              aria-label="Search this map's pages by URL"
              className="h-7 pl-7 text-xs"
            />
          </div>
          {!ready ? (
            <CannotOffer>Type at least {PAGE_SEARCH_MIN_CHARS} characters.</CannotOffer>
          ) : pages.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {topicalMapErrorText(pages.error)}
            </p>
          ) : pages.isPending ? (
            <CannotOffer>Looking through this map's pages…</CannotOffer>
          ) : (
            <Command shouldFilter={false} className="rounded-md border border-border">
              <CommandList className="max-h-40">
                <CommandEmpty className="px-2 py-2 text-xs text-muted-foreground">
                  No page of this map matches, in the {pages.data.items.length} this
                  read returned. A page this map has never listed cannot be named
                  here.
                </CommandEmpty>
                <CommandGroup>
                  {matches.map((item) => (
                    <CommandItem
                      key={item.page.id}
                      value={item.page.id}
                      className="py-1"
                      onSelect={() =>
                        onChange({
                          ...draft,
                          intoPageId: item.page.id,
                          intoPageLabel:
                            item.page.url ?? item.page.label ?? item.page.id,
                          // Exactly one destination: choosing a live page
                          // clears the planned one rather than sending both,
                          // which `map_page_intent` v1 refuses outright.
                          intoNodeId: null,
                          intoNodeLabel: null,
                        })
                      }
                    >
                      <span className="truncate text-xs">
                        {item.page.url ?? item.page.label ?? item.page.id}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </>
      )}
    </div>
  );
}

function PlannedPageSegment({
  context,
  selectionSiteIds,
  draft,
  onChange,
}: {
  context: PagesWorkspaceContext;
  selectionSiteIds: readonly string[];
  draft: BulkIntentDraft;
  onChange: (draft: BulkIntentDraft) => void;
}) {
  // A plan node belongs to ONE site. `?site=` picks it when it is set; with
  // every site in view the selection has to agree on one by itself.
  const siteId = context.siteId ?? (selectionSiteIds.length === 1 ? selectionSiteIds[0] : null);
  const [label, setLabel] = useState("");
  const [failure, setFailure] = useState<unknown>(null);

  const topicRows = useMapTopicRows(context.mapId, Boolean(draft.topicSlug));
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });
  const create = useCreatePlanNode(siteId ?? "");

  if (draft.intoNodeId) {
    return (
      <div className="flex flex-col gap-1">
        <SegmentLabel>Planned page</SegmentLabel>
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1">
          <EntityRef
            token="plan_node"
            id={draft.intoNodeId}
            name={draft.intoNodeLabel}
            openInNewTab
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() =>
              onChange({ ...draft, intoNodeId: null, intoNodeLabel: null })
            }
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  let cannot: string | null = null;
  if (context.organizationId === null) {
    cannot = "Organization not loaded yet.";
  } else if (siteId === null) {
    cannot =
      "Pick one site (?site=) to make a planned page — a plan node belongs to one site.";
  } else if (!draft.topicSlug) {
    cannot = "Choose the topic first — the planned page is created under it.";
  }

  const topicId = draft.topicSlug
    ? (topicRows.data?.find((row) => row.slug === draft.topicSlug)?.id ?? null)
    : null;

  const slug = convertToKebabCase(label);
  const plannedStatus = statuses.categories.find((category) => category.slug === "planned");

  const submit = () => {
    if (!siteId || context.organizationId === null || !draft.topicSlug) return;
    setFailure(null);
    create.mutate(
      {
        site_id: siteId,
        organization_id: context.organizationId,
        node_type: "article",
        label: label.trim(),
        slug,
        status_id: plannedStatus?.id ?? null,
        // The planned page lives under the topic these pages are moving to —
        // which is why the topic has to be chosen first.
        topic_id: topicId,
      },
      {
        onSuccess: (node) => {
          onChange({
            ...draft,
            intoNodeId: node.id,
            intoNodeLabel: node.label,
            // Exactly one destination (see the live-page segment).
            intoPageId: null,
            intoPageLabel: null,
          });
          setLabel("");
        },
        onError: (error) => setFailure(error),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <SegmentLabel>Make a planned page here</SegmentLabel>
      {cannot ? (
        <CannotOffer>{cannot}</CannotOffer>
      ) : (
        <>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Electronics recycling"
            aria-label="Planned page label"
            className="h-7 text-xs"
          />
          <p className="font-mono text-[11px] text-muted-foreground">
            /{slug || "…"}
            {plannedStatus ? "" : " · no “planned” status exists in this organization, so it is created without one"}
            {draft.topicSlug && topicRows.isSuccess && topicId === null
              ? " · this map has no row for the chosen topic, so it is created without one"
              : ""}
          </p>
          {failure ? (
            <p role="alert" className="text-xs text-destructive">
              {topicalMapErrorText(failure)}
            </p>
          ) : null}
          {label.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={submit}
            >
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              {create.isPending ? "Creating the planned page…" : "Create and point here"}
            </Button>
          ) : (
            // A control that cannot act says why, rather than sitting there
            // greyed out.
            <CannotOffer>Name the planned page to create it.</CannotOffer>
          )}
        </>
      )}
    </div>
  );
}
