"use client";

// features/esign/templates/listConfig.tsx — /esign/templates as an entity-list config.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { TEMPLATE_COLUMNS } from "./columns";
import { fetchTemplateCounts, fetchTemplateFacets, fetchTemplatePage } from "./service";
import { useTemplateRowActions } from "./useTemplateRowActions";
import { templateEditHref, type TemplateRow } from "./types";

export const templateListConfig: EntityListConfig<TemplateRow> = {
  surfaceKey: "esign-templates-browse",
  registryToken: "esign_template",
  entityLabel: { singular: "template", plural: "templates" },
  sourceFeature: "documents",
  scopes: ["all", "mine"],
  service: { fetchPage: fetchTemplatePage, fetchCounts: fetchTemplateCounts, fetchFacets: fetchTemplateFacets },
  columns: TEMPLATE_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { hrefFor: (row) => templateEditHref(row.id) },
  useRowActions: useTemplateRowActions,
  facetSections: [],
  copy: {
    label: "Template",
    listLabel: "Templates",
    location: "/esign/templates",
    rowKind: "template",
    listKind: "template-list",
    humanRow: (row) => `${row.name} — ${row.documents} documents, ${row.roles} roles`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No templates yet",
    description: "Save an envelope as a template to reuse it.",
  },
};
