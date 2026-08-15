"use client";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye } from "lucide-react";
import type { EntityListConfig } from "@/lib/entity-list/config";
import { INITIATIVE_COLUMNS } from "./columns";
import {
  fetchInitiativeFacets,
  fetchInitiativeListPage,
  fetchInitiativeScopeCounts,
  saveInitiativeRowEdit,
} from "./service";
import {
  INITIATIVE_LIST_SCOPES,
  initiativeHref,
  type InitiativeListRow,
} from "./types";

function useActions() {
  const router = useRouter();
  return {
    actions: {
      onOpenRow: (r: InitiativeListRow) => router.push(initiativeHref(r)),
      menuFor: (r: InitiativeListRow) => () => ({
        header: { title: r.name },
        sections: [
          {
            id: "open",
            items: [
              {
                id: "open",
                label: "Open",
                icon: Eye,
                kind: "link" as const,
                href: initiativeHref(r),
              },
              {
                id: "tab",
                label: "Open in new tab",
                icon: ExternalLink,
                kind: "link" as const,
                href: initiativeHref(r),
                target: "_blank" as const,
              },
            ],
          },
        ],
      }),
    },
  };
}
export const initiativeListConfig: EntityListConfig<InitiativeListRow> = {
  surfaceKey: "marketing-initiatives",
  entityLabel: { singular: "initiative", plural: "initiatives" },
  sourceFeature: "marketing",
  scopes: INITIATIVE_LIST_SCOPES,
  service: {
    fetchPage: fetchInitiativeListPage,
    fetchCounts: fetchInitiativeScopeCounts,
    fetchFacets: fetchInitiativeFacets,
  },
  columns: INITIATIVE_COLUMNS,
  prefsVersion: 1,
  getRowId: (r) => r.id,
  getRowName: (r) => r.name,
  door: { token: "marketing_initiative" },
  getRowEntity: (r) => ({
    type: "marketing_initiative",
    id: r.id,
    title: r.name,
    resourceType: "marketing_initiative",
  }),
  useRowActions: useActions,
  edit: { save: saveInitiativeRowEdit },
  supportsArchived: false,
  facetSections: [
    {
      facet: "brand",
      filterId: "brand_name",
      label: "Brands",
      noneLabel: "All brands",
    },
    {
      facet: "status",
      filterId: "status",
      label: "Statuses",
      noneLabel: "None",
    },
    {
      facet: "objective",
      filterId: "objective",
      label: "Objectives",
      noneLabel: "None",
    },
    {
      facet: "currency",
      filterId: "budget_currency",
      label: "Currencies",
      noneLabel: "None",
    },
  ],
  emptyState: {
    title: "No initiatives here",
    description:
      "Create an initiative to give work across channels one goal, timeline, and budget.",
  },
};
