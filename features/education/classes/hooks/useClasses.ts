// features/education/classes/hooks/useClasses.ts
//
// The class layer's public read+write hook. A class is a scope under the
// per-user "Class" scope type; this hook consumes the CANONICAL scope thunks
// (features/agent-context/redux/scope) — it never re-implements scope CRUD and
// never writes appContextSlice (a class is LOCAL data; making one "active" is
// the ActiveScopePicker's job — features/scopes/FEATURE.md §Global vs local).

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  CLASS_SCOPE_TYPE_SLUG,
  CLASS_SCOPE_TYPE_SEED,
  DEFAULT_ACCESS_MODE,
} from "../constants";
import { scopeToClass, serializeClassSettings } from "../settings";
import { setAccessMode } from "../service";
import type { ClassSettings, StudyClass } from "../types";
import type { ScopeNode as Scope } from "@/features/scopes/types";
import {
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/scopes/redux/selectors/admin";
import {
  selectTreeError,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  createScope,
  createScopeType,
  deleteScope,
  updateScope,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { unwrapScopesRpc } from "@/features/scopes/types";

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
  /**
   * The scope-tree read's failure (null when it succeeded or is in flight).
   * A failed load counts as "loaded", so an empty `classes` with an `error`
   * is NOT "no classes" — gate the empty view on it (RC-B12).
   */
  error: unknown;
  orgId: string | null;
  /**
   * Ensure the Class scope type exists in `forOrgId` (default: the selected
   * workspace); returns its id, or null when no workspace is selected.
   * Idempotent.
   */
  ensureClassType: (forOrgId?: string) => Promise<string | null>;
  /**
   * Create a class. With no workspace selected this ASKS the person which one
   * (the org gate) and continues with their answer; it throws
   * `OrganizationSelectionCancelled` if they close the picker. Never a silent
   * no-op.
   */
  createClass: (input: CreateClassInput) => Promise<StudyClass>;
  updateClass: (
    id: string,
    patch: { name?: string; description?: string; settings?: ClassSettings },
  ) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const emptySettings = (): ClassSettings => ({
  examDates: [],
  accessMode: DEFAULT_ACCESS_MODE,
});

export function useClasses(): UseClassesReturn {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectOrganizationId);

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
    if (orgId && !typesLoaded) void dispatch(ensureScopeTree());
  }, [dispatch, orgId, typesLoaded]);

  // Load the classes (scopes of the Class type) once it's known.
  useEffect(() => {
    if (orgId && classTypeId && !scopesLoaded) {
      void dispatch(ensureScopeTree());
    }
  }, [dispatch, orgId, classTypeId, scopesLoaded]);

  const all = scopeRows.map(scopeToClass).sort((a, b) => a.name.localeCompare(b.name));
  const classes = all.filter((c) => !c.settings.archived);
  const archived = all.filter((c) => c.settings.archived);

  const loading = !typesLoaded || (classTypeId != null && !scopesLoaded);
  const treeStatus = useAppSelector(selectTreeStatus);
  const treeError = useAppSelector(selectTreeError);
  const error: unknown = treeStatus === "error" ? (treeError ?? true) : null;

  const store = useAppStore();

  const ensureClassType = useCallback(
    async (forOrgId?: string): Promise<string | null> => {
      const org = forOrgId ?? orgId;
      if (!org) return null;
      if (org === orgId && classTypeId) return classTypeId;
      // Re-check freshly from the store (avoids a double-create race across
      // mounts, and covers a workspace chosen after this render).
      if (!selectScopeTypesLoadedForOrg(store.getState(), org))
        await dispatch(ensureScopeTree());
      const existing = selectScopeTypesByOrg(store.getState(), org).find(
        (t) => t.slug === CLASS_SCOPE_TYPE_SLUG,
      );
      if (existing) return existing.id;
      const created = await dispatch(
        createScopeType({
          org_id: org,
          label_singular: CLASS_SCOPE_TYPE_SEED.labelSingular,
          label_plural: CLASS_SCOPE_TYPE_SEED.labelPlural,
          icon: CLASS_SCOPE_TYPE_SEED.icon,
          color: CLASS_SCOPE_TYPE_SEED.color,
          description: CLASS_SCOPE_TYPE_SEED.description,
          slug: CLASS_SCOPE_TYPE_SLUG,
        }),
      ).then(unwrapScopesRpc);
      return created.id;
    },
    [dispatch, store, orgId, classTypeId],
  );

  const createClass = useCallback(
    async (input: CreateClassInput): Promise<StudyClass> => {
      // No workspace selected → ask which one, then carry on (never a silent
      // no-op: the Create button and agent writes both land here).
      const org = await ensureOrgId(orgId);
      const typeId = await ensureClassType(org);
      if (!typeId)
        throw new Error("Could not find or create the Class type in this workspace.");
      const settings = { ...emptySettings(), ...input.settings };
      const scope = (await dispatch(
        createScope({
          org_id: org,
          type_id: typeId,
          name: input.name.trim(),
          description: input.description?.trim() ?? "",
          settings: serializeClassSettings(settings),
        }),
      ).then(unwrapScopesRpc)) as Scope;
      // Register the class access mode + ensure the creator's OWNER membership
      // row exists (the roster's authoritative owner). Idempotent; the scope
      // already carries access_mode in settings, this reaffirms it server-side.
      try {
        await setAccessMode(scope.id, settings.accessMode);
      } catch {
        // Non-fatal: the scope is created; owner membership self-heals on the
        // first roster/join interaction via _edu_ensure_owner_membership.
      }
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
      ).then(unwrapScopesRpc);
    },
    [dispatch],
  );

  const deleteClass = useCallback(
    async (id: string): Promise<void> => {
      await dispatch(deleteScope({ scope_id: id })).then(unwrapScopesRpc);
    },
    [dispatch],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!orgId) return;
    await dispatch(ensureScopeTree({ refresh: true }));
  }, [dispatch, orgId]);

  return {
    classes,
    archived,
    classTypeId,
    loading,
    error,
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
