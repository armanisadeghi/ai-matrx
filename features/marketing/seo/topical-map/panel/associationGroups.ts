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
