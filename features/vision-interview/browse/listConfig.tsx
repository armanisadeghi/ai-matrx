"use client";

// features/vision-interview/browse/listConfig.tsx
//
// /vision-interview expressed as an entity-list config on the canonical shell
// (lib/entity-list). Rows come from public.ivw_list_scoped (migration:
// migrations/ivw_list_scoped.sql — applied by the orchestrator).

import type { EntityListConfig } from "@/lib/entity-list/config";
import { toast } from "@/lib/toast";
import { renameSession } from "../service";
import { SESSION_COLUMNS } from "./columns";
import {
  fetchSessionFacets,
  fetchSessionPage,
  fetchSessionScopeCounts,
} from "./service";
import { useSessionRowActions } from "./useSessionRowActions";
import {
  SESSION_LIST_SCOPES,
  type SessionListRow,
  type SessionRowEdit,
} from "./types";

export const sessionListConfig: EntityListConfig<SessionListRow> = {
  surfaceKey: "vision-interview-browse",
  entityLabel: { singular: "interview", plural: "interviews" },
  // The room runs on the workflow engine; "workflow" is the registered
  // SourceFeature (FEATURE_META) closest to it. A dedicated
  // "vision-interview" key is a follow-up that spans the source registry.
  sourceFeature: "workflow",
  scopes: SESSION_LIST_SCOPES,
  service: {
    fetchPage: fetchSessionPage,
    fetchCounts: fetchSessionScopeCounts,
    fetchFacets: fetchSessionFacets,
  },
  columns: SESSION_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  door: {
    hrefFor: (row) => `/vision-interview/${row.id}`,
  },
  useRowActions: useSessionRowActions,
  edit: {
    save: async (row, edit) => {
      const patch = edit as SessionRowEdit;
      if (patch.title !== undefined) {
        try {
          await renameSession(row.id, patch.title);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not save the title.",
          );
          throw err;
        }
      }
    },
  },
  supportsArchived: false,
  facetSections: [
    {
      facet: "stage",
      filterId: "stage",
      label: "Stage",
      noneLabel: "No stage",
    },
    {
      facet: "visibility",
      filterId: "visibility",
      label: "Visibility",
      noneLabel: "None",
      minOptions: 2,
      countInLabel: false,
    },
  ],
  noneLabels: {
    organization_name: "No organization",
    owner_email: "No owner",
  },
  emptyState: {
    title: "No interviews here",
    description:
      "Start a vision interview — six roles extract what's in your head into a document good enough to build from.",
  },
};
