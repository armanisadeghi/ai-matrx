"use client";

import {
  createSlice,
  createAsyncThunk,
  createSelector,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";

export interface TemplateScopeTypeField {
  key: string;
  display_name: string;
}

export interface TemplateScopeType {
  icon: string;
  label_singular: string;
  label_plural: string;
  field_count: number;
  fields: TemplateScopeTypeField[];
  parent_type_id?: string | null;
  parent_type_key?: string | null;
  parent_type_label?: string | null;
  max_assignments_per_entity?: number | null;
}

/**
 * Flattened view of every scope_type across every template — used by the
 * "Individual scopes" mode of the template gallery so users can borrow a
 * single scope from any template instead of the entire bundle.
 */
export interface FlatTemplateScopeType extends TemplateScopeType {
  template_id: string;
  template_key: string;
  template_name: string;
  template_category: string;
  template_is_personal: boolean;
}

export interface ScopeTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_personal: boolean;
  scope_types: TemplateScopeType[];
}

interface State {
  templates: ScopeTemplate[];
  loaded: boolean;
  loading: boolean;
  applying: boolean;
  error: string | null;
}

const initialState: State = {
  templates: [],
  loaded: false,
  loading: false,
  applying: false,
  error: null,
};

export const listTemplates = createAsyncThunk(
  "templates/list",
  async (params?: { category?: string; personal_only?: boolean }) => {
    const { data, error } = await supabase.rpc("list_templates", {
      p_category: params?.category ?? undefined,
      p_personal_only:
        params?.personal_only === undefined ? undefined : params.personal_only,
    });
    if (error) throw error;
    return (data ?? []) as ScopeTemplate[];
  },
);

export const applyTemplate = createAsyncThunk(
  "templates/apply",
  async (params: { template_id: string; org_id: string }) => {
    const { data, error } = await supabase.rpc("apply_template", {
      p_template_id: params.template_id,
      p_org_id: params.org_id,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  },
);

export const applyTemplateByKey = createAsyncThunk(
  "templates/applyByKey",
  async (params: { template_key: string; org_id: string }) => {
    const { data, error } = await supabase.rpc("apply_template_by_key", {
      p_template_key: params.template_key,
      p_org_id: params.org_id,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  },
);

const slice = createSlice({
  name: "templates",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(listTemplates.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(listTemplates.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.templates = action.payload;
      })
      .addCase(listTemplates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load templates";
      })
      .addCase(applyTemplate.pending, (state) => {
        state.applying = true;
      })
      .addCase(applyTemplate.fulfilled, (state) => {
        state.applying = false;
      })
      .addCase(applyTemplate.rejected, (state, action) => {
        state.applying = false;
        state.error = action.error.message ?? "Failed to apply template";
      })
      .addCase(applyTemplateByKey.pending, (state) => {
        state.applying = true;
      })
      .addCase(applyTemplateByKey.fulfilled, (state) => {
        state.applying = false;
      })
      .addCase(applyTemplateByKey.rejected, (state, action) => {
        state.applying = false;
        state.error = action.error.message ?? "Failed to apply template";
      });
  },
});

export default slice.reducer;

type StateWithTemplates = { templates: ReturnType<typeof slice.reducer> };

export const selectAllTemplates = (s: StateWithTemplates) =>
  s.templates.templates;
export const selectTemplatesLoading = (s: StateWithTemplates) =>
  s.templates.loading;
export const selectTemplatesApplying = (s: StateWithTemplates) =>
  s.templates.applying;
export const selectTemplatesLoaded = (s: StateWithTemplates) =>
  s.templates.loaded;

export const selectTemplatesByCategory = createSelector(
  [selectAllTemplates],
  (templates) => {
    const map = new Map<string, ScopeTemplate[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  },
);

export const selectPersonalTemplates = createSelector(
  [selectAllTemplates],
  (templates) => templates.filter((t) => t.is_personal),
);

export const selectBusinessTemplates = createSelector(
  [selectAllTemplates],
  (templates) => templates.filter((t) => !t.is_personal),
);

/**
 * Flatten every template's scope_types into a single alphabetized list with
 * source-template metadata stamped on each entry. Computed once per template
 * data change.
 */
export const selectAllFlatScopeTypes = createSelector(
  [selectAllTemplates],
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
