"use client";

// features/marketing/seo/topical-map/views/pages/pageColumns.tsx
//
// The nine columns of the pages triage table. One factory, so the table and any
// future host draw the same cells rather than two drifting copies.
//
// 🚨 EVERY COLUMN IS `sortable: false`, AND THAT IS HONESTY, NOT AN OMISSION.
// `seo.list_page_intents` takes `p_map_id`, `p_site_id`, `p_topic_slug`,
// `p_disposition`, `p_state`, `p_limit` and `p_offset` — there is NO ORDER BY
// argument. A sort control here could only re-order the 200 rows already
// loaded, while looking exactly like a sort of all 4,000, and the row the
// person is hunting would stay on page 7 where the control implied it was not.
// The same reasoning makes every column `filter: false`: the filter bar above
// the table owns narrowing and says out loud which of its filters reach the
// server and which only reach the loaded page (see `./pageRows.ts`).
//
// 🚨 ROUND 22 LIVES IN THE `current topics` AND `destination` CELLS. An empty
// `current_topics` is a page whose only topic was rejected or retired, and an
// intent with no `topic` key is a decision whose destination left the map. Both
// are REAL states the server reports on purpose, and both would render as a
// blank cell — reading as "nothing to do" — if this file trusted `?.` and
// stopped. They are named instead.

import { ExternalLink } from "lucide-react";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";

import type { TopicalMapKnobs } from "../../knobs";
import type { MapLinks } from "../../links";
import { pageTopicState, pageTopicViewOf } from "../../redux/selectors";
import type { EntityRef as MapEntityRef, PageIntentItem } from "../../types";
import { IntentDot } from "../../ui/IntentDot";
import { hasImpressions, pageTrafficNumbers } from "./pageRows";

export interface PageColumnDeps {
  mapId: string;
  /**
   * EXACTLY the knobs these cells read — `intent_colors`, the convergence
   * palette, in the destination column. Declared as a `Pick` rather than the
   * whole 53 so the dependency is legible and a test can supply a real one
   * instead of casting a partial object into the full shape. A new column that
   * needs another knob widens this list; it never reads `platform.feature_knob`
   * itself (CONTRACTS §7).
   */
  knobs: Pick<TopicalMapKnobs, "intent_colors">;
  links: MapLinks;
}

/** The em dash every "nothing here" cell uses, with the reason in `title`. */
function Absent({ why, srOnly }: { why: string; srOnly?: string }) {
  return (
    <span className="text-muted-foreground" title={why}>
      —{srOnly ? <span className="sr-only">{srOnly}</span> : null}
    </span>
  );
}

/**
 * The destination of a `merge` / `redirect`, resolved by `seo._tm_ref`.
 *
 * A hidden ref is `{ type, hidden: true }` — the row EXISTS and this caller
 * cannot open it. Rendering nothing would say "this merges into nowhere",
 * which is a different and wrong fact, so the absence of a door is stated.
 */
function IntoRef({ into }: { into: MapEntityRef }) {
  if ("hidden" in into) {
    return (
      <span
        className="text-muted-foreground"
        title="It merges into a record you do not have access to. Ask for access to open it."
      >
        {into.type === "plan_node" ? "a planned page" : "a page"} you cannot open
      </span>
    );
  }
  return (
    <EntityRef
      token={into.type}
      id={into.id}
      name={into.label ?? into.url ?? into.slug ?? into.id}
    />
  );
}

export function pageColumns({
  mapId,
  knobs,
  links,
}: PageColumnDeps): MatrxColumnDef<PageIntentItem>[] {
  // Every column declares both flags explicitly — see this file's header. A
  // `sortable`/`filter` left to its default is `true`, which would put a live
  // control over a read that cannot serve it.
  const inert = { sortable: false, filter: false } as const;

  return [
    {
      id: "page",
      header: "Page",
      label: "Page",
      ...inert,
      cell: (item) => {
        const { id, label, url } = item.page;
        return (
          <span className="flex min-w-0 items-center gap-1">
            <EntityRef token="web_page" id={id} name={label ?? url ?? id} />
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${url} in a new tab`}
                title="Open the live page in a new tab"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "current_topics",
      header: "Covers",
      label: "Covers",
      ...inert,
      cell: (item) => {
        // ROUND 22: `[]` is a REAL state — the page's only topic was rejected
        // or retired and the page stayed. Never a blank cell.
        if (item.current_topics.length === 0) {
          return (
            <span
              className="text-muted-foreground"
              title="No live topic of this map covers this page. Rejecting or retiring a topic leaves its pages here."
            >
              on no topic
            </span>
          );
        }
        return (
          <span className="flex flex-wrap items-center gap-1">
            {item.current_topics.map((topic) => (
              <a
                key={topic.slug}
                href={links.topic(mapId, topic.slug)}
                onClick={(event) => event.stopPropagation()}
                title={[
                  topic.slug,
                  topic.confidence === undefined
                    ? null
                    : `confidence ${topic.confidence}`,
                  topic.source === undefined ? null : `by ${topic.source}`,
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
                className="inline-flex max-w-[12rem] truncate rounded border border-border bg-muted px-1 py-px text-[11px] leading-4 hover:bg-accent"
              >
                {topic.name}
              </a>
            ))}
          </span>
        );
      },
    },
    {
      id: "destination",
      header: "Going to",
      label: "Going to",
      ...inert,
      cell: (item) => {
        const tone = pageTopicState(pageTopicViewOf(item));
        const dot = <IntentDot tone={tone} colors={knobs.intent_colors} />;
        if (!item.intent) {
          return (
            <span className="flex items-center gap-1.5">
              {dot}
              <Absent
                why="No intent has been recorded for this page yet."
                srOnly="no intent"
              />
            </span>
          );
        }
        const { topic, disposition, into } = item.intent;
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            {dot}
            {topic ? (
              <a
                href={links.topic(mapId, topic.slug)}
                onClick={(event) => event.stopPropagation()}
                title={topic.slug}
                className="truncate hover:underline"
              >
                {topic.name}
              </a>
            ) : (
              // ROUND 22: the decision survived; the topic it named was
              // rejected or retired, so the server stopped rendering it.
              <span
                className="text-destructive"
                title="The topic this page was being sent to was rejected or retired. The decision is still recorded — give the page a new destination."
              >
                destination left the map
              </span>
            )}
            {(disposition === "merge" || disposition === "redirect") && into ? (
              <>
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
                <IntoRef into={into} />
              </>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "disposition",
      header: "Disposition",
      label: "Disposition",
      ...inert,
      cell: (item) =>
        item.intent ? (
          <span>{item.intent.disposition}</span>
        ) : (
          <Absent why="No intent has been recorded for this page yet." />
        ),
    },
    {
      id: "state",
      header: "State",
      label: "State",
      ...inert,
      cell: (item) =>
        item.intent ? (
          <span>{item.intent.state}</span>
        ) : (
          <Absent why="No intent has been recorded for this page yet." />
        ),
    },
    {
      id: "source",
      header: "Decided by",
      label: "Decided by",
      ...inert,
      cell: (item) =>
        item.intent ? (
          <span>{item.intent.source}</span>
        ) : (
          <Absent why="No intent has been recorded for this page yet." />
        ),
    },
    {
      id: "clicks",
      header: "Clicks",
      label: "Clicks",
      ...inert,
      cell: (item) => {
        // ABSENT IS NOT ZERO — a page ref with no `clicks` key was never
        // measured, and "0" would be a confident lie about a real page.
        const numbers = pageTrafficNumbers(item);
        return (
          <span className="block text-right tabular-nums">
            {numbers === null ? (
              <span className="text-muted-foreground" title="not measured for this page">
                —
              </span>
            ) : (
              numbers.clicks
            )}
          </span>
        );
      },
    },
    {
      id: "impressions",
      header: "Impressions",
      label: "Impressions",
      ...inert,
      cell: (item) => (
        <span className="block text-right tabular-nums">
          {hasImpressions(item) ? (
            item.page.impressions
          ) : (
            <span className="text-muted-foreground" title="not measured for this page">
              —
            </span>
          )}
        </span>
      ),
    },
    {
      id: "note",
      header: "Note",
      label: "Note",
      ...inert,
      cell: (item) =>
        item.intent?.note ? (
          <span className="block max-w-[18rem] truncate" title={item.intent.note}>
            {item.intent.note}
          </span>
        ) : (
          <Absent why="Whoever decided this page left no note." />
        ),
    },
  ];
}
