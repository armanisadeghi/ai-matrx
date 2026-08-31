"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
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
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
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
    // The server-authenticated admin shell can paint before the browser client
    // adopts its cookie session. Wait for the usable JWT instead of dispatching
    // an authenticated RPC as `anon` and recording the same failure twice.
    if (!authReady || !userId || !accessToken) return;

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
  }, [accessToken, authReady, categoryById, dispatch, mode, userId]);

  useEffect(() => {
    // loadExtra performs an external Redux/Supabase read and owns its async
    // loading state; rerun it when the authenticated session becomes usable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExtra();
  }, [loadExtra]);

  const rows = useMemo(() => {
    if (mode === "admin") {
      const globalRows = globalQuery.shortcuts.map((shortcut) =>
        globalShortcutToDirectoryRow(shortcut, categoryById),
      );
      // 🚨 GLOBAL WINS, AND THE ORDER IS THE FIX.
      // These two sources overlap, and they disagree about the same row.
      // `globalQuery` is the authoritative global read; the second source is
      // `agx_list_non_global_shortcuts_for_admin_m`, whose name is a promise it
      // no longer keeps. Its WHERE still defines non-global the pre-flip way —
      //   NOT (created_by IS NULL AND organization_id IS NULL AND …)
      // — so now that every global row is owned by the SYSTEM organization,
      // EVERY global shortcut satisfies "non-global" and comes back from it.
      // Worse, its scope CASE tests `created_by IS NOT NULL → 'user'` BEFORE it
      // tests the organization, and `mandate.vw_shortcut`'s write trigger does
      // `COALESCE(NEW.created_by, v_actor)` — so a global shortcut an admin just
      // created came back labelled `user` and, because it was written into the
      // map SECOND, relabelled the correct row "Personal / <that admin>".
      // A row the GLOBAL read already claimed is global by definition, so it is
      // written LAST and a list of non-global rows cannot overrule it.
      // The stale rule inside that function is filed separately; this seam does
      // not depend on it being fixed.
      const merged = new Map<string, ShortcutDirectoryRow>();
      for (const row of adminNonGlobalRows) merged.set(row.id, row);
      for (const row of globalRows) merged.set(row.id, row);
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
