"use client";

// TODO(prompt-to-agent-sweep): This entire hook reads from the legacy
// `context_menu_unified_view` (prompt-builtins source) and uses
// `features/prompt-builtins/utils/menuHierarchy` + types. The whole notes
// context menu currently sits on prompt-builtin data while routing launches
// through the agent system via id-collision. Replace this hook with a thin
// wrapper around `useUnifiedAgentContextMenu` from `features/context-menu-v2`
// so menu data, scope precedence, and `enabledFeatures` filtering all come
// from the agent side. After that swap, `NoteContextMenuContent` no longer
// needs to import anything from `features/prompt-builtins/**`.

// useNoteContextMenuGroups — Fetches and builds the category hierarchy for all
// DB-driven context menu sections (ai-action, content-block, quick-action).
// Fast path: reads from Redux contextMenuCache (populated by DeferredShellData).
// Fallback: fetches directly from Supabase if cache is empty.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { buildCategoryHierarchy } from "@/features/prompt-builtins/utils/menuHierarchy";
import type { CategoryGroup } from "@/features/prompt-builtins/types/menu";
import { useAppSelector } from "@/lib/redux/hooks";
import type { ContextMenuCacheState } from "@/lib/redux/slices/contextMenuCacheSlice";

export interface NoteContextMenuGroups {
  aiGroups: CategoryGroup[];
  contentBlockGroups: CategoryGroup[];
  organizationToolGroups: CategoryGroup[];
  userToolGroups: CategoryGroup[];
  loading: boolean;
}

/** Matches UnifiedContextMenu DB sections (excludes quick-action; that is local). */
const PLACEMENT_TYPES = [
  "ai-action",
  "content-block",
  "organization-tool",
  "user-tool",
] as const;

export function useNoteContextMenuGroups(): NoteContextMenuGroups {
  const cachedRows = useAppSelector(
    (state) =>
      (state as unknown as { contextMenuCache: ContextMenuCacheState })
        .contextMenuCache?.rows ?? [],
  );
  const isHydrated = useAppSelector(
    (state) =>
      (state as unknown as { contextMenuCache: ContextMenuCacheState })
        .contextMenuCache?.hydrated ?? false,
  );

  const [aiGroups, setAiGroups] = useState<CategoryGroup[]>([]);
  const [contentBlockGroups, setContentBlockGroups] = useState<CategoryGroup[]>(
    [],
  );
  const [organizationToolGroups, setOrganizationToolGroups] = useState<
    CategoryGroup[]
  >([]);
  const [userToolGroups, setUserToolGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fast path — Redux cache already populated by DeferredShellData
    if (isHydrated && cachedRows.length > 0) {
      const ai = cachedRows
        .filter((r) => r.placement_type === "ai-action")
        .flatMap((r) =>
          buildCategoryHierarchy(
            r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
            undefined,
          ),
        );
      const cb = cachedRows
        .filter((r) => r.placement_type === "content-block")
        .flatMap((r) =>
          buildCategoryHierarchy(
            r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
            undefined,
          ),
        );
      const org = cachedRows
        .filter((r) => r.placement_type === "organization-tool")
        .flatMap((r) =>
          buildCategoryHierarchy(
            r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
            undefined,
          ),
        );
      const userT = cachedRows
        .filter((r) => r.placement_type === "user-tool")
        .flatMap((r) =>
          buildCategoryHierarchy(
            r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
            undefined,
          ),
        );
      setAiGroups(ai);
      setContentBlockGroups(cb);
      setOrganizationToolGroups(org);
      setUserToolGroups(userT);
      setLoading(false);
      return;
    }

    // Fallback — fetch from Supabase
    (async () => {
      try {
        const { data, error } = await supabase
          .from("context_menu_unified_view")
          .select("placement_type, categories_flat")
          .in("placement_type", [...PLACEMENT_TYPES]);

        if (error || !data) {
          console.error("[useNoteContextMenuGroups] Supabase error:", error);
          setLoading(false);
          return;
        }

        const rows = data as {
          placement_type: string;
          categories_flat: unknown[];
        }[];

        const ai = rows
          .filter((r) => r.placement_type === "ai-action")
          .flatMap((r) =>
            buildCategoryHierarchy(
              r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
              undefined,
            ),
          );
        const cb = rows
          .filter((r) => r.placement_type === "content-block")
          .flatMap((r) =>
            buildCategoryHierarchy(
              r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
              undefined,
            ),
          );
        const org = rows
          .filter((r) => r.placement_type === "organization-tool")
          .flatMap((r) =>
            buildCategoryHierarchy(
              r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
              undefined,
            ),
          );
        const userT = rows
          .filter((r) => r.placement_type === "user-tool")
          .flatMap((r) =>
            buildCategoryHierarchy(
              r.categories_flat as Parameters<typeof buildCategoryHierarchy>[0],
              undefined,
            ),
          );

        setAiGroups(ai);
        setContentBlockGroups(cb);
        setOrganizationToolGroups(org);
        setUserToolGroups(userT);
      } catch (err) {
        console.error("[useNoteContextMenuGroups] Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isHydrated, cachedRows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    aiGroups,
    contentBlockGroups,
    organizationToolGroups,
    userToolGroups,
    loading,
  };
}
