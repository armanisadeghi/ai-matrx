// features/scopes/redux/selectors/templates.ts
//
// Selectors over the scopeTemplates slice (read-only catalog).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  ContextTemplate,
  FlatTemplateScopeType,
} from "@/features/scopes/types";

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

/**
 * Every template's scope types flattened into one alphabetized list with
 * source-template metadata stamped on each entry — the "Individual scopes"
 * borrow list in the template gallery.
 */
export const selectFlatTemplateScopeTypes = createSelector(
  selectTemplatesList,
  (templates): FlatTemplateScopeType[] => {
    const out: FlatTemplateScopeType[] = [];
    for (const t of templates) {
      for (const st of t.scope_types) {
        out.push({
          ...st,
          template_id: t.id,
          template_key: t.key,
          template_name: t.name,
          template_category: t.category,
          template_is_personal: t.is_personal,
        });
      }
    }
    out.sort((a, b) =>
      a.label_plural.localeCompare(b.label_plural, undefined, {
        sensitivity: "base",
      }),
    );
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
