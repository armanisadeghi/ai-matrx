"use client";

/**
 * views/outline/topicPageRows.tsx — the PAGE rows that hang under a topic the
 * person expanded "to its pages" (vision §2.1: "intent color dots on pages
 * when a topic is expanded to its pages").
 *
 * PURE. It takes what `seo.map_topic_associations(map, slug, ['pages'])`
 * returned plus whatever intents the workspace already listed, and hands back
 * `TopicTreeRow`s. No hook, no store, no fetch — so the same derivation is
 * testable against a payload shaped exactly like the server's and reusable by
 * any other view that wants a topic's pages inline.
 *
 * THREE THINGS THIS MUST NOT GET WRONG:
 *
 * 1. ONE ROW PER PAGE. A page reaches a topic on up to two edges — role
 *    `covers` (the mapper says it talks about this topic today) and role
 *    `intent` (a person or agent says it is GOING here). Both rows describe one
 *    page; drawing two would double every count a reader makes by eye.
 * 2. A HIDDEN EDGE IS A ROW, NOT A GAP. `map_topic_associations` counts the
 *    pages the caller cannot open instead of listing them. That count becomes
 *    one honest row ("3 pages you cannot open"); dropping it would make a
 *    topic look emptier than it is — the confident lie this feature exists to
 *    kill.
 * 3. THE TONE IS `pageIntentTone`'s ANSWER, never a guess here. Where the page
 *    is going comes from the workspace's listed intent when it has one (that
 *    record sees every topic), else from this topic's own `intent` edge. A page
 *    with no intent anywhere and a `covers` edge here is simply in place.
 */

import type { ReactNode } from "react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { TopicTreeRow } from "@/components/official/topic-tree/TopicTree";

import type { MapIntentColors } from "../../knobs";
import { pageIntentTone } from "../../redux/selectors";
import type { PageIntentTone, PageIntentView } from "../../redux/types";
import {
  isHiddenMapTopicAssociation,
  isWebPageItem,
  type MapTopicAssociation,
  type PageIntentDisposition,
  type PageIntentRecord,
  type PageIntentState,
  type WebPageItem,
} from "../../types";
import { IntentDot } from "../../ui/IntentDot";

/** A page row's id is `page:<topic slug>:<page id>`. Slugs are `[a-z0-9-]`, ids are UUIDs: neither holds a colon. */
export const PAGE_ROW_PREFIX = "page:";

export function pageRowId(slug: string, pageId: string): string {
  return `${PAGE_ROW_PREFIX}${slug}:${pageId}`;
}

/** The `(slug, pageId)` behind a page-row id, or null for a topic row. */
export function parsePageRowId(id: string): { slug: string; pageId: string } | null {
  if (!id.startsWith(PAGE_ROW_PREFIX)) return null;
  const rest = id.slice(PAGE_ROW_PREFIX.length);
  const at = rest.indexOf(":");
  if (at <= 0 || at === rest.length - 1) return null;
  return { slug: rest.slice(0, at), pageId: rest.slice(at + 1) };
}

/** The id of the one synthetic row that stands for the pages the caller cannot open. */
export function hiddenPagesRowId(slug: string): string {
  return `${PAGE_ROW_PREFIX}${slug}:hidden`;
}

/** The topic a row belongs to: itself for a topic row, its parent for a page row. */
export function topicSlugOfRow(id: string): string {
  return parsePageRowId(id)?.slug ?? id;
}

/** A page row, with what the tree does not need but a test and a menu do. */
export interface OutlinePageRow extends TopicTreeRow {
  kind: "page";
  pageId: string;
  page: WebPageItem;
  /** Null = no intent is known for this page anywhere. */
  tone: PageIntentTone | null;
}

/** The one row standing for `N` pages the caller cannot open. */
export interface OutlineHiddenPagesRow extends TopicTreeRow {
  kind: "hidden-pages";
  hidden: number;
}

export interface TopicPageRowsArgs {
  slug: string;
  /** The TOPIC's depth; page rows sit one level below it. */
  depth: number;
  associations: readonly MapTopicAssociation[];
  /** `selectMapIntentsByPageId(mapId)` — the intents this workspace has listed. */
  intents: Readonly<Record<string, PageIntentRecord>>;
  /** `coverageByPageId` for listed pages — `[]` is "on no topic", absent is "never listed". */
  coverage: Readonly<Record<string, readonly string[]>>;
  colors: MapIntentColors;
  /** The `outline_intent_dots` knob. Off = no dot, the row still exists. */
  dotsOn: boolean;
}

const DISPOSITIONS: readonly PageIntentDisposition[] = [
  "keep",
  "move",
  "merge",
  "redirect",
  "rewrite",
  "delete",
];
const STATES: readonly PageIntentState[] = ["proposed", "accepted", "done"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the `map_page_intent` payload off an `intent`-role edge. A payload
 * this build does not recognise yields null — the row still renders, without a
 * tone, rather than inventing a disposition.
 */
function intentFromPayload(payload: unknown): {
  disposition: PageIntentDisposition;
  state: PageIntentState;
} | null {
  if (!isRecord(payload)) return null;
  const disposition = payload.disposition;
  if (typeof disposition !== "string" || !DISPOSITIONS.includes(disposition as PageIntentDisposition)) {
    return null;
  }
  // `state` defaults to `proposed` exactly as the server does when an item omits it.
  const state = typeof payload.state === "string" && STATES.includes(payload.state as PageIntentState)
    ? (payload.state as PageIntentState)
    : "proposed";
  return { disposition: disposition as PageIntentDisposition, state };
}

interface PageAccumulator {
  page: WebPageItem;
  coversHere: boolean;
  /** This topic's own `intent` edge, when the page has one pointing here. */
  localIntent: { disposition: PageIntentDisposition; state: PageIntentState } | null;
}

/**
 * How ONE topic's row draws ONE page: the workspace's listed intent first
 * (it knows every topic the page touches), else this topic's own edge.
 */
function toneFor(
  slug: string,
  acc: PageAccumulator,
  intents: TopicPageRowsArgs["intents"],
  coverage: TopicPageRowsArgs["coverage"],
): PageIntentTone | null {
  const listed = intents[acc.page.id];
  const listedCoverage = coverage[acc.page.id];
  const currentTopicSlugs: string[] = listedCoverage
    ? [...listedCoverage]
    : acc.coversHere
      ? [slug]
      : [];

  if (listed) {
    const view: PageIntentView = {
      pageId: acc.page.id,
      disposition: listed.disposition,
      state: listed.state,
      intendedTopicSlug: listed.topic?.slug ?? null,
      currentTopicSlugs,
    };
    return pageIntentTone(view, slug);
  }
  if (acc.localIntent) {
    const view: PageIntentView = {
      pageId: acc.page.id,
      disposition: acc.localIntent.disposition,
      state: acc.localIntent.state,
      intendedTopicSlug: slug,
      currentTopicSlugs,
    };
    return pageIntentTone(view, slug);
  }
  // No intent anywhere: a page covering this topic is simply in place here.
  return acc.coversHere ? "in_place" : null;
}

export function topicPageRows({
  slug,
  depth,
  associations,
  intents,
  coverage,
  colors,
  dotsOn,
}: TopicPageRowsArgs): (OutlinePageRow | OutlineHiddenPagesRow)[] {
  const byPage = new Map<string, PageAccumulator>();
  let hidden = 0;

  for (const row of associations) {
    if (row.association.kind !== "web_page") continue;
    if (isHiddenMapTopicAssociation(row)) {
      hidden += row.item.hidden;
      continue;
    }
    if (!isWebPageItem(row.item)) continue;
    const acc = byPage.get(row.item.id) ?? {
      page: row.item,
      coversHere: false,
      localIntent: null,
    };
    if (row.association.role === "covers") acc.coversHere = true;
    if (row.association.role === "intent") {
      acc.localIntent = intentFromPayload(row.association.payload) ?? acc.localIntent;
    }
    byPage.set(row.item.id, acc);
  }

  const rows: (OutlinePageRow | OutlineHiddenPagesRow)[] = [];
  for (const acc of byPage.values()) {
    const tone = toneFor(slug, acc, intents, coverage);
    const label = acc.page.label ?? acc.page.url ?? acc.page.id;
    rows.push({
      kind: "page",
      id: pageRowId(slug, acc.page.id),
      parentId: slug,
      depth: depth + 1,
      label,
      hasChildren: false,
      expanded: false,
      selected: false,
      pageId: acc.page.id,
      page: acc.page,
      tone,
      trailing: (
        <PageRowTrailing page={acc.page} tone={tone} colors={colors} dotsOn={dotsOn} />
      ),
      actions: <PageRowDoors page={acc.page} label={label} />,
    });
  }

  if (hidden > 0) {
    rows.push({
      kind: "hidden-pages",
      id: hiddenPagesRowId(slug),
      parentId: slug,
      depth: depth + 1,
      label: `${hidden} ${hidden === 1 ? "page" : "pages"} you cannot open`,
      hasChildren: false,
      expanded: false,
      selected: false,
      hidden,
      trailing: (
        <span className="text-[11px] text-muted-foreground">
          counted by the server, never listed
        </span>
      ),
    });
  }

  return rows;
}

/** The dot (knob-gated) and the page's clicks. A real zero prints as 0 — `WebPageItem` says so. */
function PageRowTrailing({
  page,
  tone,
  colors,
  dotsOn,
}: {
  page: WebPageItem;
  tone: PageIntentTone | null;
  colors: MapIntentColors;
  dotsOn: boolean;
}): ReactNode {
  return (
    <>
      {dotsOn && tone ? <IntentDot tone={tone} colors={colors} /> : null}
      <span
        className="text-[11px] tabular-nums text-muted-foreground"
        title={`${page.clicks} clicks · ${page.impressions} impressions over the last ${page.performance_window_days} days`}
      >
        {page.clicks}
      </span>
    </>
  );
}

/**
 * The page's doors — peek + new tab — through `EntityRef`, THE way a record is
 * named (THE DOOR LAW). The row already prints the page's name as its label,
 * so `EntityRef` gets a visually hidden child: `children` replaces what is
 * drawn while `name` still supplies the accessible label and tooltip, which is
 * exactly the seam its docs describe for "a table cell renders its own title".
 * Both controls (peek, new tab) survive because they hang off the wrapper, not
 * the label.
 */
function PageRowDoors({ page, label }: { page: WebPageItem; label: string }): ReactNode {
  return (
    <EntityRef token="web_page" id={page.id} name={label} showIcon={false} alwaysShowActions>
      <span className="sr-only">{label}</span>
    </EntityRef>
  );
}
