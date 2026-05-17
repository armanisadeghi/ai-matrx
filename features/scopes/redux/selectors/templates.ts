// features/scopes/redux/selectors/templates.ts
//
// Selectors over the scopeTemplates slice (read-only catalog).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { ContextTemplate } from "@/features/scopes/types";

const emptyTemplates: ContextTemplate[] = [];

const selectTemplatesSlice = (state: RootState) => state.scopeTemplates;

export const selectTemplatesStatus = createSelector(
  selectTemplatesSlice,
  (s) => s.status,
);

export const selectTemplatesError = createSelector(
  selectTemplatesSlice,
  (s) => s.error,
);

export const selectTemplatesList = createSelector(
  selectTemplatesSlice,
  (s): ContextTemplate[] => s.templates ?? emptyTemplates,
);

export const selectTemplatesByCategory = createSelector(
  selectTemplatesList,
  (templates): Record<string, ContextTemplate[]> => {
    const out: Record<string, ContextTemplate[]> = {};
    for (const t of templates) {
      const cat = t.category || "uncategorized";
      if (!out[cat]) out[cat] = [];
      out[cat].push(t);
    }
    for (const cat of Object.keys(out)) {
      out[cat].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    }
    return out;
  },
);

export const makeSelectTemplate = () =>
  createSelector(
    selectTemplatesList,
    (_: RootState, templateId: string | null | undefined) => templateId,
    (list, templateId): ContextTemplate | null =>
      (templateId && list.find((t) => t.id === templateId)) || null,
  );
