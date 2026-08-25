/**
 * THE FULL LOOP — every step of a value receipt links to the screen where that
 * step can be CHANGED.
 *
 * Arman (2026-08-23): "that's the full loop that makes users fall in love with
 * a system." A receipt that explains a number but leaves the reader with no
 * way to act on it is a dead end (no-dead-ends): the explanation IS the
 * navigation. One step, one door, stated in the reader's words.
 *
 * ONE definition, consumed by the (i) popover in every table and by the
 * Why-this-score panel. Never fork a second mapping — a step that gains an
 * editor gains it here.
 *
 * Every target screen reads the query params this file writes:
 *   /value/topics     ?topic=<id>[&worth=1]        (TopicTreeWorkbench)
 *   /value/dimensions ?dimension=<slug>&value=<id>[&matcher=<id>]  (DimensionManager
 *                      — `matcher` opens THE MATCHER EDITOR, KI-008, straight
 *                      onto that value; any truthy value works, the matcher's
 *                      own id just rides along for a future "ring that row")
 *   /value/rules      ?bands=value_band            (MeaningRulesWorkbench)
 *   /value            ?kw=<keyword>               (ValueWorkbench)
 *   /value/dimensions ?combo=<id>                 (the combinations panel —
 *                      C7 combinations are authored where their values live)
 *   /keywords         ?st=<dimension>:<value>|…&cols=…  (the keyword list,
 *                      filtered; `__none` selects the keywords a dimension has
 *                      no answer for — KI-022)
 */

import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  STAMP_BLANK_VALUE,
  encodeStampFilter,
} from "@/features/marketing/search-console/types";
import type { ValueReason } from "./types";

export interface ReasonEditorLink {
  href: string;
  /** What the reader gets by following it, in their words. */
  label: string;
}

export interface ReasonLinkContext {
  brandId: string | null | undefined;
  siteId: string;
  /** The keyword this receipt belongs to — the workbench searches by text. */
  keyword?: string | null;
}

const VALUE_QUERY_KEYS = {
  topic: "topic",
  worth: "worth",
  dimension: "dimension",
  value: "value",
  matcher: "matcher",
  bands: "bands",
  keyword: "kw",
  combo: "combo",
} as const;

function valuePath(
  ctx: ReasonLinkContext,
  sub: string,
  params: Record<string, string | undefined>,
): string {
  const base = marketingRoutes.site(ctx.brandId, ctx.siteId, sub);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/** The band thresholds — the rule that turns a score into a level word. */
export function levelVocabularyHref(ctx: ReasonLinkContext): string {
  return valuePath(ctx, "/value/rules", {
    [VALUE_QUERY_KEYS.bands]: "value_band",
  });
}

/** The topic tree, opened AT one node (optionally with its worth editor open). */
export function topicNodeHref(
  ctx: ReasonLinkContext,
  topicId: string | null | undefined,
  openWorth = false,
): string {
  return valuePath(ctx, "/value/topics", {
    [VALUE_QUERY_KEYS.topic]: topicId ?? undefined,
    [VALUE_QUERY_KEYS.worth]: openWorth ? "1" : undefined,
  });
}

/** The dimension editor, opened at one value (optionally at one matcher). */
export function dimensionValueHref(
  ctx: ReasonLinkContext,
  dimension: string,
  valueId: string | null | undefined,
  matcherId?: string | null,
): string {
  return valuePath(ctx, "/value/dimensions", {
    [VALUE_QUERY_KEYS.dimension]: dimension,
    [VALUE_QUERY_KEYS.value]: valueId ?? undefined,
    [VALUE_QUERY_KEYS.matcher]: matcherId ?? undefined,
  });
}

/**
 * THE KEYWORD LIST, opened on a set of stamps (all-of). `cols` brings those
 * dimensions' own columns with it, so the reader arrives somewhere they can
 * ACT rather than somewhere they must first configure.
 */
export function stampMatchHref(
  ctx: ReasonLinkContext,
  pairs: ReadonlyArray<{ dimension: string; value: string }>,
): string {
  const base = marketingRoutes.site(ctx.brandId, ctx.siteId, "/keywords");
  const search = new URLSearchParams({
    st: encodeStampFilter(pairs),
    cols: [...new Set(pairs.map((pair) => pair.dimension))].join(","),
  });
  return `${base}?${search.toString()}`;
}

/**
 * KI-022 — THE COVERAGE METER'S DOOR. A dimension that describes 3% of a
 * site's clicks is a filter over nothing, and the only useful next move is to
 * see the keywords it has no answer for. `st=<dimension>:__none` is that list
 * (server predicate: `seo.gsc_stamp_keyword_set`).
 */
export function dimensionBlanksHref(
  ctx: ReasonLinkContext,
  dimension: string,
): string {
  return stampMatchHref(ctx, [
    { dimension, value: STAMP_BLANK_VALUE },
  ]);
}

/**
 * Where this step is changed. `null` only when a step genuinely has no editor
 * — never as a shrug; every kind below resolves to a real screen.
 */
export function reasonEditorLink(
  reason: ValueReason,
  ctx: ReasonLinkContext,
): ReasonEditorLink | null {
  switch (reason.kind) {
    case "summary":
      // The arithmetic is not editable; the LEVEL it lands in is — that is the
      // band thresholds, and it is the question a reader actually has here.
      return {
        href: levelVocabularyHref(ctx),
        label: "Change the level thresholds",
      };
    case "override":
      return {
        href: valuePath(ctx, "/value", {
          [VALUE_QUERY_KEYS.keyword]: ctx.keyword ?? undefined,
        }),
        label: "Change or clear your ruling",
      };
    case "topic":
      return {
        href: topicNodeHref(ctx, reason.topic_id, true),
        label: `Change what “${reason.topic}” is worth`,
      };
    case "no_base":
      return {
        href: topicNodeHref(ctx, null),
        label: "Place this keyword on a weighted topic",
      };
    case "stamp":
      return {
        href: dimensionValueHref(
          ctx,
          reason.dimension,
          reason.value_id,
          reason.matcher_id,
        ),
        // KI-008 — the matcher editor is real now: a matcher step opens it
        // directly on the value it stamps, ready to add/preview/disable.
        label: reason.matcher_id
          ? `Open the matcher that stamps “${reason.value_label}”`
          : `Change what “${reason.value_label}” is worth`,
      };
    case "combo":
      // KI-004 — combinations are authored on the Dimensions screen, beside
      // the values they are made of. One home, one editor.
      return {
        href: valuePath(ctx, "/value/dimensions", {
          [VALUE_QUERY_KEYS.combo]: reason.combo_id,
        }),
        label: "Edit this combination",
      };
    case "rule":
      return {
        href: valuePath(ctx, "/value/rules", {}),
        label: `Edit the rule “${reason.name}”`,
      };
    case "geo":
      return {
        href: valuePath(ctx, "/value/rules", { areas: "incomplete" }),
        label: `Edit the area “${reason.area}”`,
      };
    default:
      return null;
  }
}

/** The door for a LEVEL word itself (the chip in a table, the level column). */
export function levelEditorLink(ctx: ReasonLinkContext): ReasonEditorLink {
  return {
    href: levelVocabularyHref(ctx),
    label: "Edit the level vocabulary",
  };
}
