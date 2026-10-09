"use client";

// features/esign/templates/service.ts — /esign/templates reads through `esign_template_list`
// (the doors decide access; All | Mine lanes, the page's organization filter is `p_org_id`).

import type { EntityFacets, EntityListPage, EntityListQuery, EntityListSort, EntityScopeCounts } from "@/lib/entity-list/types";
import type { ListScopeWord } from "@/lib/list-scope";
import { listOrgParam } from "@/lib/list-scope/types";
import { listTemplateRows } from "../editor/api/realApi";
import type { TemplateRow } from "./types";

async function rows(lane: "all" | "mine", query: EntityListQuery): Promise<TemplateRow[]> {
  return listTemplateRows({ lane, orgId: listOrgParam(query) ?? null, search: query.search });
}

const SORTABLE: Record<string, (r: TemplateRow) => string | number> = {
  name: (r) => r.name.toLowerCase(),
  updated_at: (r) => r.updated_at,
  documents: (r) => r.documents.length,
  roles: (r) => r.roles.length,
  organization_name: (r) => r.organization_name ?? "",
};

export async function fetchTemplatePage(query: EntityListQuery, sort: EntityListSort, scope?: ListScopeWord): Promise<EntityListPage<TemplateRow>> {
  const list = await rows((scope ?? query.scope.kind) === "mine" ? "mine" : "all", query);
  const key = SORTABLE[sort.sort] ?? SORTABLE.updated_at;
  const sorted = [...list].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const o = x < y ? -1 : x > y ? 1 : 0;
    return sort.direction === "asc" ? o : -o;
  });
  const from = (query.page - 1) * sort.pageSize;
  return { rows: sorted.slice(from, from + sort.pageSize), total: sorted.length };
}

export async function fetchTemplateCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
  const [all, mine] = await Promise.all([rows("all", query), rows("mine", query)]);
  return { byKind: { all: all.length, mine: mine.length }, narrow: {} };
}

export async function fetchTemplateFacets(): Promise<EntityFacets> {
  return { byKind: {} };
}
