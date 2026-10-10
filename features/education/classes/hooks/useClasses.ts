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
import type { Scope } from "@ai-matrx/records/scopes";
import {
  selectAllScopeTypes,
  selectScopeTreeSettled,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
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
import { unwrapRecords } from "@/features/scopes/service/scopeDoors";

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
  /**
   * EVERY Class scope type the person can reach, across all their organizations
   * (one per org that has classes). Never just the active org's — the active org
   * is only where a NEW class lands (`ensureClassType`).
   */
  classTypeIds: string[];
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
  ) => Promise<StudyClass>;
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

  // THE LAW (access belongs to the person): "My classes" is every Class the
  // person can reach in EVERY organization of their tree — never only the
  // selected one. The selected org is only where a NEW class lands.
  const treeSettled = useAppSelector(selectScopeTreeSettled);
  const allTypes = useAppSelector(selectAllScopeTypes);
  const classTypes = allTypes.filter((t) => t.slug === CLASS_SCOPE_TYPE_SLUG);
  const scopeRows: Scope[] = classTypes.flatMap((t) => t.scopes);
  const classTypeId =
    (orgId ? classTypes.find((t) => t.organization_id === orgId)?.id : null) ??
    null;
  const classTypeIds = classTypes.map((t) => t.id);
  const typesLoaded = treeSettled;
  const scopesLoaded = treeSettled;

  // Load the tree once (no-refetch policy inside the thunk).
  useEffect(() => {
    if (!treeSettled) void dispatch(ensureScopeTree());
  }, [dispatch, treeSettled]);

  const all = scopeRows.map(scopeToClass).sort((a, b) => a.name.localeCompare(b.name));
  const classes = all.filter((c) => !c.settings.archived);
  const archived = all.filter((c) => c.settings.archived);

  const loading = !typesLoaded || !scopesLoaded;
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
          organization_id: org,
          label_singular: CLASS_SCOPE_TYPE_SEED.labelSingular,
          label_plural: CLASS_SCOPE_TYPE_SEED.labelPlural,
          icon: CLASS_SCOPE_TYPE_SEED.icon,
          color: CLASS_SCOPE_TYPE_SEED.color,
          description: CLASS_SCOPE_TYPE_SEED.description,
          slug: CLASS_SCOPE_TYPE_SLUG,
        }),
      ).then(unwrapRecords);
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
          organization_id: org,
          scope_type_id: typeId,
          name: input.name.trim(),
          description: input.description?.trim() ?? "",
          settings: serializeClassSettings(settings),
        }),
      ).then(unwrapRecords)) as Scope;
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
    ): Promise<StudyClass> => {
      // `settings` REPLACES the stored JSON — pass the class's full settings.
      const scope = (await dispatch(
        updateScope({
          scope_id: id,
          name: patch.name,
          description: patch.description,
          settings: patch.settings
            ? serializeClassSettings(patch.settings)
            : undefined,
        }),
      ).then(unwrapRecords)) as Scope;
      return scopeToClass(scope);
    },
    [dispatch],
  );

  const deleteClass = useCallback(
    async (id: string): Promise<void> => {
      await dispatch(deleteScope({ scope_id: id })).then(unwrapRecords);
    },
    [dispatch],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await dispatch(ensureScopeTree({ refresh: true }));
  }, [dispatch]);

  return {
    classes,
    archived,
    classTypeIds,
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

