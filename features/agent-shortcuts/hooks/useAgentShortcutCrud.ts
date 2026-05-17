"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  createShortcut,
  updateShortcut,
  deleteShortcut,
  duplicateShortcut,
  promoteShortcutToGlobal,
  listNonGlobalShortcutsForAdmin,
  type AdminNonGlobalShortcutRow,
} from "@/features/agents/redux/agent-shortcuts/thunks";
import {
  createShortcutFromAgentSurface,
  type CreateShortcutFromAgentSurfaceArgs,
} from "@/features/agents/redux/agent-shortcuts/thunks/createShortcutFromAgentSurface.thunk";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  duplicateCategory,
  type DuplicateCategoryInput,
} from "@/features/agents/redux/agent-shortcut-categories/thunks";
import {
  createContentBlock,
  updateContentBlock,
  deleteContentBlock,
} from "@/features/agents/redux/agent-content-blocks/thunks";
import type { AgentScope } from "../constants";
import type {
  AgentContentBlock,
  AgentShortcut,
  AgentShortcutCategory,
  CategoryFormData,
  ContentBlockFormData,
  ShortcutFormData,
} from "../types";

export interface UseAgentShortcutCrudArgs {
  scope: AgentScope;
  scopeId?: string;
}

export interface UseAgentShortcutCrudResult {
  createShortcut: (data: ShortcutFormData) => Promise<string>;
  updateShortcut: (id: string, data: Partial<AgentShortcut>) => Promise<void>;
  deleteShortcut: (id: string) => Promise<void>;
  duplicateShortcut: (id: string, targetCategoryId?: string) => Promise<string>;
  createShortcutFromAgentSurface: (
    args: CreateShortcutFromAgentSurfaceArgs,
  ) => Promise<string>;
  promoteShortcutToGlobal: (args: {
    shortcutId: string;
    targetCategoryId: string;
    label?: string | null;
  }) => Promise<string>;
  listNonGlobalShortcutsForAdmin: () => Promise<AdminNonGlobalShortcutRow[]>;
  createCategory: (data: CategoryFormData) => Promise<string>;
  updateCategory: (
    id: string,
    data: Partial<AgentShortcutCategory>,
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  duplicateCategory: (
    args: DuplicateCategoryInput,
  ) => Promise<AgentShortcutCategory>;
  createContentBlock: (data: ContentBlockFormData) => Promise<string>;
  updateContentBlock: (
    id: string,
    data: Partial<AgentContentBlock>,
  ) => Promise<void>;
  deleteContentBlock: (id: string) => Promise<void>;
}

function applyScopeWrapper<T extends object>(
  scope: AgentScope,
  scopeId: string | undefined,
  payload: T,
): T & { scope: AgentScope; scopeId: string | null } {
  return {
    ...payload,
    scope,
    scopeId: scopeId ?? null,
  };
}

function applyScopeToRowFields<T extends object>(
  scope: AgentScope,
  scopeId: string | undefined,
  payload: T,
): T & {
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
} {
  const scoped = {
    ...payload,
    userId: null as string | null,
    organizationId: null as string | null,
    projectId: null as string | null,
    taskId: null as string | null,
  };
  const id = scopeId ?? null;
  if (scope === "organization") scoped.organizationId = id;
  else if (scope === "project") scoped.projectId = id;
  else if (scope === "task") scoped.taskId = id;
  return scoped;
}

export function useAgentShortcutCrud({
  scope,
  scopeId,
}: UseAgentShortcutCrudArgs): UseAgentShortcutCrudResult {
  const dispatch = useAppDispatch();

  const doCreateShortcut = useCallback(
    async (data: ShortcutFormData) => {
      const scoped = applyScopeToRowFields(scope, scopeId, data);
      const result = await dispatch(createShortcut(scoped)).unwrap();
      return result as string;
    },
    [dispatch, scope, scopeId],
  );

  const doUpdateShortcut = useCallback(
    async (id: string, data: Partial<AgentShortcut>) => {
      await dispatch(updateShortcut({ id, ...data })).unwrap();
    },
    [dispatch],
  );

  const doDeleteShortcut = useCallback(
    async (id: string) => {
      await dispatch(deleteShortcut(id)).unwrap();
    },
    [dispatch],
  );

  const doDuplicateShortcut = useCallback(
    async (id: string, targetCategoryId?: string) => {
      const result = await dispatch(
        duplicateShortcut({ id, categoryId: targetCategoryId }),
      ).unwrap();
      return result as string;
    },
    [dispatch],
  );

  const doCreateShortcutFromAgentSurface = useCallback(
    async (args: CreateShortcutFromAgentSurfaceArgs) => {
      const result = await dispatch(
        createShortcutFromAgentSurface(args),
      ).unwrap();
      return result as string;
    },
    [dispatch],
  );

  const doPromoteShortcutToGlobal = useCallback(
    async (args: {
      shortcutId: string;
      targetCategoryId: string;
      label?: string | null;
    }) => {
      const result = await dispatch(promoteShortcutToGlobal(args)).unwrap();
      return result;
    },
    [dispatch],
  );

  const doListNonGlobalShortcutsForAdmin = useCallback(async () => {
    const result = await dispatch(listNonGlobalShortcutsForAdmin()).unwrap();
    return result;
  }, [dispatch]);

  const doCreateCategory = useCallback(
    async (data: CategoryFormData) => {
      const scoped = applyScopeWrapper(scope, scopeId, data);
      const result = await dispatch(createCategory(scoped)).unwrap();
      return (result as { id: string }).id;
    },
    [dispatch, scope, scopeId],
  );

  const doUpdateCategory = useCallback(
    async (id: string, data: Partial<AgentShortcutCategory>) => {
      await dispatch(updateCategory({ id, ...data })).unwrap();
    },
    [dispatch],
  );

  const doDeleteCategory = useCallback(
    async (id: string) => {
      await dispatch(deleteCategory(id)).unwrap();
    },
    [dispatch],
  );

  const doDuplicateCategory = useCallback(
    async (args: DuplicateCategoryInput) => {
      const result = await dispatch(duplicateCategory(args)).unwrap();
      return result;
    },
    [dispatch],
  );

  const doCreateContentBlock = useCallback(
    async (data: ContentBlockFormData) => {
      const scoped = applyScopeWrapper(scope, scopeId, data);
      const result = await dispatch(createContentBlock(scoped)).unwrap();
      return (result as { id: string }).id;
    },
    [dispatch, scope, scopeId],
  );

  const doUpdateContentBlock = useCallback(
    async (id: string, data: Partial<AgentContentBlock>) => {
      await dispatch(updateContentBlock({ id, ...data })).unwrap();
    },
    [dispatch],
  );

  const doDeleteContentBlock = useCallback(
    async (id: string) => {
      await dispatch(deleteContentBlock(id)).unwrap();
    },
    [dispatch],
  );

  return {
    createShortcut: doCreateShortcut,
    updateShortcut: doUpdateShortcut,
    deleteShortcut: doDeleteShortcut,
    duplicateShortcut: doDuplicateShortcut,
    createShortcutFromAgentSurface: doCreateShortcutFromAgentSurface,
    promoteShortcutToGlobal: doPromoteShortcutToGlobal,
    listNonGlobalShortcutsForAdmin: doListNonGlobalShortcutsForAdmin,
    createCategory: doCreateCategory,
    updateCategory: doUpdateCategory,
    deleteCategory: doDeleteCategory,
    duplicateCategory: doDuplicateCategory,
    createContentBlock: doCreateContentBlock,
    updateContentBlock: doUpdateContentBlock,
    deleteContentBlock: doDeleteContentBlock,
  };
}
