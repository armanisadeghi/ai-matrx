"use client";

// features/commerce-intake/labels/listConfig.tsx
//
// /commerce/labels expressed as an entity-list config. Direct PostgREST like
// the /maps consumer (no RPC): the surface declares ONE truthful scope —
// "orgs", narrowed to the effective organization — and label_batch is an
// org register the whole team reads. The config is built per org, so the
// service closures carry the org explicitly (THE VIEW LAW: the query
// declares its scope; RLS is only the ceiling).

import type { EntityListConfig } from "@/lib/entity-list/config";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";

import { LABEL_BATCH_COLUMNS } from "./columns";
import { fetchLabelBatchPage } from "./service";
import {
  LABEL_BATCH_LIST_SCOPES,
  labelBatchHref,
  type LabelBatchListRow,
} from "./types";
import { useLabelBatchRowActions } from "./useLabelBatchRowActions";

function stateFilterValues(query: EntityListQuery): string[] | null {
  const f = query.filters.state;
  if (f && f.kind === "select" && f.values.length > 0) return f.values;
  return null;
}

async function fetchPage(
  organizationId: string,
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<LabelBatchListRow>> {
  return fetchLabelBatchPage({
    organizationId,
    search: query.search,
    page: query.page,
    pageSize: sort.pageSize,
    sort: sort.sort,
    ascending: sort.direction === "asc",
    states: stateFilterValues(query) ?? undefined,
  });
}

export function buildLabelBatchListConfig(
  organizationId: string,
): EntityListConfig<LabelBatchListRow> {
  return {
    surfaceKey: "commerce-label-batches",
    entityLabel: { singular: "label batch", plural: "label batches" },
    // The registry has no commerce entry yet; product_capture_intake is the
    // intake lane this feature canonicalizes.
    sourceFeature: "product_capture_intake",
    scopes: LABEL_BATCH_LIST_SCOPES,
    service: {
      fetchPage: (query, sort) => fetchPage(organizationId, query, sort),
      fetchCounts: async (
        query: EntityListQuery,
      ): Promise<EntityScopeCounts> => {
        const page = await fetchLabelBatchPage({
          organizationId,
          search: query.search,
          page: 1,
          pageSize: 1,
          sort: "created_at",
          ascending: false,
        });
        return { byKind: { orgs: page.total }, narrow: {} };
      },
      fetchFacets: async (): Promise<EntityFacets> => ({ byKind: {} }),
    },
    columns: LABEL_BATCH_COLUMNS,
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => row.purpose || "Label batch",
    door: { hrefFor: labelBatchHref },
    useRowActions: useLabelBatchRowActions,
    supportsArchived: false,
    facetSections: [],
    emptyState: {
      title: "No label batches yet",
      description:
        "A label batch is one print run of pooled QR codes: mint the codes, print the sheet, stick labels on items — scanning a label in intake claims it for that item.",
    },
  };
}
