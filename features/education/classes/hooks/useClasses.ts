// features/education/classes/hooks/useClasses.ts
//
// The class layer's public read+write hook. A class is a scope under the
// per-user "Class" scope type; this hook consumes the CANONICAL scope thunks
// (features/agent-context/redux/scope) — it never re-implements scope CRUD and
// never writes appContextSlice (a class is LOCAL data; making one "active" is
// the ActiveScopePicker's job — features/scopes/FEATURE.md §Global vs local).

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectPersonalOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  fetchScopeTypes,
  createScopeType,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  createScope,
  updateScope,
  deleteScope,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import type { Scope } from "@/features/agent-context/redux/scope/types";
import {
  CLASS_SCOPE_TYPE_SLUG,
  CLASS_SCOPE_TYPE_SEED,
} from "../constants";
import { scopeToClass, serializeClassSettings } from "../settings";
import type { ClassSettings, StudyClass } from "../types";

export interface CreateClassInput {
  name: string;
  description?: string;
  settings?: Partial<ClassSettings>;
}

export interface UseClassesReturn {
  /** Active (non-archived) classes, name-ordered. */
  classes: StudyClass[];
  /** Archived classes (soft-hidden). */
  archived: StudyClass[];
  /** The resolved Class scope type id, once known. */
  classTypeId: string | null;
  loading: boolean;
  orgId: string | null;
  /** Ensure the Class scope type exists; returns its id. Idempotent. */
  ensureClassType: () => Promise<string | null>;
  createClass: (input: CreateClassInput) => Promise<StudyClass | null>;
  updateClass: (
    id: string,
    patch: { name?: string; description?: string; settings?: ClassSettings },
  ) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const emptySettings = (): ClassSettings => ({ examDates: [] });

export function useClasses(): UseClassesReturn {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectPersonalOrganizationId);

  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) =>
    orgId ? selectScopeTypesByOrg(s, orgId) : EMPTY_TYPES,
  );

  const classType =
    scopeTypes.find((t) => t.slug === CLASS_SCOPE_TYPE_SLUG) ?? null;
  const classTypeId = classType?.id ?? null;

  const scopesLoaded = useAppSelector((s) =>
    orgId && classTypeId ? selectScopesLoadedForType(s, orgId, classTypeId) : false,
  );
  const scopeRows = useAppSelector((s) =>
    classTypeId ? selectScopesByType(s, classTypeId) : EMPTY_SCOPES,
  );

  // Load the org's scope types once.
  useEffect(() => {
    if (orgId && !typesLoaded) void dispatch(fetchScopeTypes(orgId));
  }, [dispatch, orgId, typesLoaded]);

  // Load the classes (scopes of the Class type) once it's known.
  useEffect(() => {
    if (orgId && classTypeId && !scopesLoaded) {
      void dispatch(fetchScopes({ org_id: orgId, type_id: classTypeId }));
    }
  }, [dispatch, orgId, classTypeId, scopesLoaded]);

  const all = scopeRows.map(scopeToClass).sort((a, b) => a.name.localeCompare(b.name));
  const classes = all.filter((c) => !c.settings.archived);
  const archived = all.filter((c) => c.settings.archived);

  const loading = !typesLoaded || (classTypeId != null && !scopesLoaded);

  const ensureClassType = useCallback(async (): Promise<string | null> => {
    if (!orgId) return null;
    if (classTypeId) return classTypeId;
    // Re-check freshly (avoids a double-create race across mounts).
    if (!typesLoaded) await dispatch(fetchScopeTypes(orgId)).unwrap();
    const created = await dispatch(
      createScopeType({
        org_id: orgId,
        label_singular: CLASS_SCOPE_TYPE_SEED.labelSingular,
        label_plural: CLASS_SCOPE_TYPE_SEED.labelPlural,
        icon: CLASS_SCOPE_TYPE_SEED.icon,
        color: CLASS_SCOPE_TYPE_SEED.color,
        description: CLASS_SCOPE_TYPE_SEED.description,
        slug: CLASS_SCOPE_TYPE_SLUG,
      }),
    ).unwrap();
    return created.id;
  }, [dispatch, orgId, classTypeId, typesLoaded]);

  const createClass = useCallback(
    async (input: CreateClassInput): Promise<StudyClass | null> => {
      if (!orgId) return null;
      const typeId = await ensureClassType();
      if (!typeId) return null;
      const settings = { ...emptySettings(), ...input.settings };
      const scope = (await dispatch(
        createScope({
          org_id: orgId,
          type_id: typeId,
          name: input.name.trim(),
          description: input.description?.trim() ?? "",
          settings: serializeClassSettings(settings),
        }),
      ).unwrap()) as Scope;
      // Make sure the class list reflects it even before a refetch.
      return scopeToClass(scope);
    },
    [dispatch, orgId, ensureClassType],
  );

  const updateClass = useCallback(
    async (
      id: string,
      patch: { name?: string; description?: string; settings?: ClassSettings },
    ): Promise<void> => {
      await dispatch(
        updateScope({
          scope_id: id,
          name: patch.name,
          description: patch.description,
          settings: patch.settings
            ? serializeClassSettings(patch.settings)
            : undefined,
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const deleteClass = useCallback(
    async (id: string): Promise<void> => {
      await dispatch(deleteScope(id)).unwrap();
    },
    [dispatch],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!orgId) return;
    await dispatch(fetchScopeTypes(orgId)).unwrap();
    if (classTypeId) {
      await dispatch(
        fetchScopes({ org_id: orgId, type_id: classTypeId }),
      ).unwrap();
    }
  }, [dispatch, orgId, classTypeId]);

  return {
    classes,
    archived,
    classTypeId,
    loading,
    orgId,
    ensureClassType,
    createClass,
    updateClass,
    deleteClass,
    refresh,
  };
}

// Stable empty references so selectors don't churn re-renders.
const EMPTY_TYPES: never[] = [];
const EMPTY_SCOPES: never[] = [];
