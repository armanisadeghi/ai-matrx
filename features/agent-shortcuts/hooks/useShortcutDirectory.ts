"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchUserShortcuts,
  listNonGlobalShortcutsForAdmin,
} from "@/features/agents/redux/agent-shortcuts/thunks";
import type { UserShortcutItem } from "@/features/agents/redux/agent-shortcuts/types";
import { useAgentShortcuts } from "./useAgentShortcuts";
import type { AgentShortcutCategory } from "../types";
import type {
  ShortcutDirectoryMode,
  ShortcutDirectoryRow,
} from "../utils/shortcut-directory-rows";
import {
  adminNonGlobalRowToDirectoryRow,
  globalShortcutToDirectoryRow,
  userShortcutItemToDirectoryRow,
} from "../utils/shortcut-directory-rows";

export interface UseShortcutDirectoryArgs {
  mode: ShortcutDirectoryMode;
}

export interface UseShortcutDirectoryResult {
  rows: ShortcutDirectoryRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function buildCategoryMap(
  categories: AgentShortcutCategory[],
): Map<string, AgentShortcutCategory> {
  const map = new Map<string, AgentShortcutCategory>();
  for (const category of categories) {
    map.set(category.id, category);
  }
  return map;
}

export function useShortcutDirectory({
  mode,
}: UseShortcutDirectoryArgs): UseShortcutDirectoryResult {
  const dispatch = useAppDispatch();
  const globalQuery = useAgentShortcuts({
    scope: "global",
    autoFetch: mode === "admin",
  });
  const userCategoriesQuery = useAgentShortcuts({
    scope: "user",
    autoFetch: mode === "user",
  });

  const [userRows, setUserRows] = useState<ShortcutDirectoryRow[]>([]);
  const [adminNonGlobalRows, setAdminNonGlobalRows] = useState<
    ShortcutDirectoryRow[]
  >([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryById = useMemo(() => {
    const categories =
      mode === "admin"
        ? globalQuery.categories
        : userCategoriesQuery.categories;
    return buildCategoryMap(categories);
  }, [mode, globalQuery.categories, userCategoriesQuery.categories]);

  const loadExtra = useCallback(async () => {
    setLoadingExtra(true);
    setError(null);
    try {
      if (mode === "admin") {
        const nonGlobal = await dispatch(
          listNonGlobalShortcutsForAdmin(),
        ).unwrap();
        setAdminNonGlobalRows(
          nonGlobal.map((row) =>
            adminNonGlobalRowToDirectoryRow(row, categoryById),
          ),
        );
        setUserRows([]);
        return;
      }

      const items = await dispatch(fetchUserShortcuts()).unwrap();
      setUserRows(
        items.map((item) => userShortcutItemToDirectoryRow(item, categoryById)),
      );
      setAdminNonGlobalRows([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load shortcuts";
      setError(message);
    } finally {
      setLoadingExtra(false);
    }
  }, [categoryById, dispatch, mode]);

  useEffect(() => {
    void loadExtra();
  }, [loadExtra]);

  const rows = useMemo(() => {
    if (mode === "admin") {
      const globalRows = globalQuery.shortcuts.map((shortcut) =>
        globalShortcutToDirectoryRow(shortcut, categoryById),
      );
      const merged = new Map<string, ShortcutDirectoryRow>();
      for (const row of globalRows) merged.set(row.id, row);
      for (const row of adminNonGlobalRows) merged.set(row.id, row);
      return Array.from(merged.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    }

    return [...userRows].sort((a, b) => a.label.localeCompare(b.label));
  }, [adminNonGlobalRows, categoryById, globalQuery.shortcuts, mode, userRows]);

  const isLoading =
    loadingExtra ||
    (mode === "admin" ? globalQuery.isLoading : userCategoriesQuery.isLoading);

  return {
    rows,
    isLoading,
    error,
    refetch: loadExtra,
  };
}
