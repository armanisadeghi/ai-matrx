"use client";

// features/commerce-intake/labels/printers/listConfig.tsx
//
// /commerce/labels/printers expressed as an entity-list config. Direct
// PostgREST like the label-batches list: ONE truthful scope — "orgs", narrowed
// to the effective organization. A certification is a team fact ("can we print
// on this printer?"), never a personal one, so the config is built per org and
// the service closures carry the org explicitly (THE VIEW LAW).

import type { EntityListConfig } from "@/lib/entity-list/config";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";

import { CERTIFIED_PRINTER_COLUMNS } from "./columns";
import { fetchCertifiedPrinterPage } from "./service";
import {
  CERTIFIED_PRINTER_LIST_SCOPES,
  certifyPrinterHref,
  printerDisplayName,
  type CertifiedPrinterListRow,
} from "./types";
import { useCertifiedPrinterRowActions } from "./useCertifiedPrinterRowActions";

function textFilter(query: EntityListQuery, id: string): string | undefined {
  const f = query.filters[id];
  return f && f.kind === "text" && f.value ? f.value : undefined;
}

function selectFilter(query: EntityListQuery, id: string): string[] | undefined {
  const f = query.filters[id];
  return f && f.kind === "select" && f.values.length > 0 ? f.values : undefined;
}

function argsFor(
  organizationId: string,
  query: EntityListQuery,
  page: number,
  pageSize: number,
  sort: string,
  ascending: boolean,
) {
  return {
    organizationId,
    search: query.search,
    page,
    pageSize,
    sort,
    ascending,
    makeContains: textFilter(query, "printer_make"),
    modelContains: textFilter(query, "printer_model"),
    connectionContains: textFilter(query, "connection_note"),
    statuses: selectFilter(query, "status"),
    templateIds: selectFilter(query, "template_id"),
    certifiedBuckets: selectFilter(query, "certified_at"),
    createdBuckets: selectFilter(query, "created_at"),
  };
}

export function buildCertifiedPrinterListConfig(
  organizationId: string,
): EntityListConfig<CertifiedPrinterListRow> {
  return {
    surfaceKey: "commerce-certified-printers",
    entityLabel: { singular: "certified printer", plural: "certified printers" },
    // The registry has no commerce entry yet; product_capture_intake is the
    // intake lane this feature canonicalizes (same choice as label batches).
    sourceFeature: "product_capture_intake",
    scopes: CERTIFIED_PRINTER_LIST_SCOPES,
    service: {
      fetchPage: async (
        query: EntityListQuery,
        sort: EntityListSort,
      ): Promise<EntityListPage<CertifiedPrinterListRow>> =>
        fetchCertifiedPrinterPage(
          argsFor(
            organizationId,
            query,
            query.page,
            sort.pageSize,
            sort.sort,
            sort.direction === "asc",
          ),
        ),
      fetchCounts: async (
        query: EntityListQuery,
      ): Promise<EntityScopeCounts> => {
        const page = await fetchCertifiedPrinterPage(
          argsFor(organizationId, query, 1, 1, "created_at", false),
        );
        return { byKind: { orgs: page.total }, narrow: {} };
      },
      fetchFacets: async (): Promise<EntityFacets> => ({ byKind: {} }),
    },
    columns: CERTIFIED_PRINTER_COLUMNS,
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => printerDisplayName(row),
    // The door is the certification record itself — opening it walks the same
    // wizard against the stored printer + stock (the re-check lane).
    door: { hrefFor: (row) => certifyPrinterHref(row.id) },
    useRowActions: useCertifiedPrinterRowActions,
    supportsArchived: false,
    facetSections: [],
    emptyState: {
      title: "No printers certified yet",
      description:
        "We officially support the Brother QL-810W, DYMO LW550 and Zebra ZD410. Certifying any other printer takes about two minutes: print one calibration page, answer four questions about how it came out, and the result is recorded here for your whole team.",
    },
  };
}
