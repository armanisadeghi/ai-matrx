/**
 * How the panel reads `seo.map_topic_associations` — pure, so a test can hand
 * it rows and read the grouping back.
 *
 * THE GENERIC RULE (vision §2.3): the panel renders ANY kind, including kinds
 * that did not exist when it was built. Four kinds have a section of their own
 * because the vision names them (pages, planned pages, keywords, facets); every
 * other kind is grouped by whatever string the function returned, labelled by
 * the entity registry when it knows the token and by the token itself when it
 * does not. There is no switch over kinds anywhere in this folder.
 *
 * HIDDEN ROWS. Migration 18 ("no hidden counts anywhere") removed the
 * `{type, hidden: n}` rows round 17 appended — an item the caller cannot open
 * is now ABSENT. The type in `types.ts` still carries the variant, so a reader
 * that meets one (an older function body, a replayed fixture) prints it as a
 * count rather than crashing or inventing a label.
 */

import {
  isHiddenMapTopicAssociation,
  isWebPageItem,
  type MapTopicAssociation,
  type MapTopicAssociationHidden,
  type MapTopicAssociationResolved,
  type WebPageItem,
} from "../types";

/** The kinds with a section of their own. Everything else is generic. */
export const SPECIAL_KINDS = new Set(["web_page", "plan_node", "seo_keyword", "seo_map_facet_value"]);

export interface AssociationGroup {
  kind: string;
  rows: MapTopicAssociationResolved[];
  /** Withheld edges, summed over directions. 0 when the function listed everything. */
  hidden: number;
}

export interface PageAssociation {
  row: MapTopicAssociationResolved;
  item: WebPageItem;
}

export interface SplitAssociations {
  pages: PageAssociation[];
  planned: MapTopicAssociationResolved[];
  keywords: MapTopicAssociationResolved[];
  /** Every other kind, grouped, in the order the function returned them (by kind). */
  generic: AssociationGroup[];
}

export function splitAssociations(rows: readonly MapTopicAssociation[]): SplitAssociations {
  const pages: PageAssociation[] = [];
  const planned: MapTopicAssociationResolved[] = [];
  const keywords: MapTopicAssociationResolved[] = [];
  const generic = new Map<string, AssociationGroup>();

  const groupFor = (kind: string): AssociationGroup => {
    let group = generic.get(kind);
    if (!group) {
      group = { kind, rows: [], hidden: 0 };
      generic.set(kind, group);
    }
    return group;
  };

  for (const row of rows) {
    if (isHiddenMapTopicAssociation(row)) {
      const hidden: MapTopicAssociationHidden = row;
      if (!SPECIAL_KINDS.has(hidden.association.kind)) {
        groupFor(hidden.association.kind).hidden += hidden.item.hidden;
      }
      continue;
    }
    const kind = row.association.kind;
    if (kind === "web_page" && isWebPageItem(row.item)) {
      pages.push({ row, item: row.item });
    } else if (kind === "plan_node") {
      planned.push(row);
    } else if (kind === "seo_keyword") {
      keywords.push(row);
    } else if (kind === "seo_map_facet_value") {
      // The facets section reads `seo.map_topic_facets`, which carries the
      // inherited flag and the facet key — the edge alone does not.
      continue;
    } else {
      groupFor(kind).rows.push(row);
    }
  }

  return { pages, planned, keywords, generic: [...generic.values()] };
}

/** The label a resolved item prints: the function's own first non-null name, else its id. */
export function itemLabel(row: MapTopicAssociationResolved): string {
  return row.item.label ?? row.item.slug ?? row.item.url ?? row.item.id;
}

/**
 * One kind's slice of a PAGED `seo.map_topic_associations` read.
 *
 * The panel asks for `pageSize + 1` rows per kind. A kind that came back with
 * more than `pageSize` has more: the extra row is dropped and the last SHOWN
 * row's cursor is where "Show more" continues. The server never counts rows
 * it did not resolve, so "has more" is the only honest thing a page can say —
 * a total comes from the tree's own counts, never from here.
 */
export interface KindPage {
  rows: MapTopicAssociation[];
  /** The cursor to continue from, or null when this kind is complete. */
  next: string | null;
}

/** Split a paged read into its kinds, in the order the server returned them. */
export function pageByKind(
  rows: readonly MapTopicAssociation[],
  pageSize: number,
): Map<string, KindPage> {
  const byKind = new Map<string, MapTopicAssociation[]>();
  for (const row of rows) {
    const kind = row.association.kind;
    const list = byKind.get(kind);
    if (list) list.push(row);
    else byKind.set(kind, [row]);
  }
  const out = new Map<string, KindPage>();
  for (const [kind, list] of byKind) {
    const shown = list.slice(0, pageSize);
    const last = shown[shown.length - 1];
    const next =
      list.length > pageSize && last && !isHiddenMapTopicAssociation(last)
        ? (last.association.cursor ?? null)
        : null;
    out.set(kind, { rows: shown, next });
  }
  return out;
}
