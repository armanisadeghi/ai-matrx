// features/research/browse/topicListBundle.ts
//
// The `topic_list` bundle: the page of topics ON SCREEN as one XML element,
// every row the person sees, inside the list page's context budget.
//
// Every row is kept; what gives is the length of each research question (the
// one long field). Only when even name-only rows would not fit does it drop
// rows from the end — and then `shown` says how many made it, so a cut is
// never mistaken for the end. `total` is the true number of matching topics
// across every page, `on_page` the rows the person has on screen.

import { xmlAttrs, xmlElement, xmlText } from "@/features/surfaces/runtime/context-bundle";
import type { ResearchTopicListRow } from "./types";

/**
 * The share of the page's 10,000-char budget the visible list gets. Above the
 * ~4,000 list-page guideline on purpose: a topic row carries a 36-char id plus
 * status, organization, project and date, so 4,000 cannot hold a default page
 * (27-50 rows) even with no research question at all. Nothing else on this
 * surface is inlined, so the page stays well inside 10,000.
 */
export const TOPIC_LIST_BUDGET = 7000;
const QUESTION_MAX = 240;
const QUESTION_MIN = 40;

export interface TopicListBundleInput {
  rows: ResearchTopicListRow[];
  total: number;
  scope: string;
  search: string;
  archived: string;
}

function renderRow(row: ResearchTopicListRow, questionMax: number): string {
  return xmlElement(
    "topic",
    {
      id: row.id,
      status: row.status,
      org: row.organization_name,
      project: row.project_name,
      updated: row.updated_at?.slice(0, 10),
      archived: row.archived_at ? row.archived_at.slice(0, 10) : null,
    },
    [row.name, questionMax > 0 ? xmlText("question", row.description, { max: questionMax }) : ""],
  );
}

export function buildTopicListXml(
  input: TopicListBundleInput,
  budget = TOPIC_LIST_BUDGET,
): string {
  const { rows } = input;
  const baseAttrs = {
    scope: input.scope,
    search: input.search.trim() || null,
    archived: input.archived === "active" ? null : input.archived,
    total: input.total,
    on_page: rows.length,
  };
  const wrap = (body: string[], shown?: number) => {
    const attrs = xmlAttrs({ ...baseAttrs, ...(shown !== undefined ? { shown } : {}) });
    return body.length ? `<topics${attrs}>${body.join("\n")}</topics>` : `<topics${attrs}/>`;
  };

  // Widest question that keeps every row inside the budget.
  for (let questionMax = QUESTION_MAX; questionMax >= QUESTION_MIN; questionMax -= 20) {
    const out = wrap(rows.map((row) => renderRow(row, questionMax)));
    if (out.length <= budget) return out;
  }
  const names = rows.map((row) => renderRow(row, 0));
  if (wrap(names).length <= budget) return wrap(names);
  // Even names alone do not fit: keep the first rows, say how many.
  const kept: string[] = [];
  for (const row of names) {
    if (wrap([...kept, row], kept.length + 1).length > budget) break;
    kept.push(row);
  }
  return wrap(kept, kept.length);
}
