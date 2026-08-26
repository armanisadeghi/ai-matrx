/**
 * Saved views for one data table — load, apply, and keep in step with the URL.
 *
 * THE URL STAYS THE SOURCE OF TRUTH. Applying a view does not put the grid into
 * some other mode; it writes the view's settings into the URL through the same
 * setters a person's clicks use. So a saved view is a shortcut to a URL, the
 * address bar still describes what is on screen, and the link is still
 * shareable. There is no second state to keep in sync and therefore no second
 * state to drift.
 *
 * `activeViewId` is remembered only so the bar can highlight a chip and show an
 * unsaved dot. It is deliberately NOT in the URL: which named shortcut you took
 * to a view is not part of the view, and putting it in the URL would make two
 * identical views look different because one was reached by a chip.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/use-toast";

import type { TableViewState } from "../table-view-url";
import {
  definitionFromViewState,
  viewStateFromDefinition,
  type SavedViewDefinition,
} from "./definition";
import {
  createSavedView,
  deleteSavedView,
  getTableOrganizationId,
  listSavedViews,
  renameSavedView,
  setDefaultSavedView,
  updateSavedViewDefinition,
  type SavedView,
} from "./service";

export function useSavedViews(args: {
  tableId: string;
  /** The live view, so the bar can tell saved from unsaved. */
  viewState: TableViewState;
  defaults: { pageSize: number };
  /** Apply a whole view to the grid (writes the URL). */
  applyViewState: (next: TableViewState) => void;
  /** True while the grid has never been touched — decides default auto-apply. */
  viewIsPristine: boolean;
}) {
  const {
    tableId,
    viewState,
    defaults,
    applyViewState,
    viewIsPristine,
  } = args;

  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const liveDefinition = definitionFromViewState(viewState, defaults);

  const load = useCallback(async (): Promise<SavedView[]> => {
    setLoading(true);
    const result = await listSavedViews({ tableId });
    setLoading(false);
    if (!result.success) {
      // Loud, never silent — but a failed view list must not take the table
      // down with it, so the grid keeps working with no views.
      toast({
        title: "Could not load saved views",
        description: result.error,
        variant: "destructive",
      });
      return [];
    }
    setViews(result.data);
    return result.data;
  }, [tableId]);

  const apply = useCallback(
    (view: SavedView) => {
      applyViewState(viewStateFromDefinition(view.definition, defaults));
      setActiveViewId(view.id);
    },
    [applyViewState, defaults],
  );

  // Switching tables must drop everything: another table's views are not this
  // table's, and a lingering activeViewId would highlight a chip that is gone.
  useEffect(() => {
    setViews([]);
    setActiveViewId(null);
  }, [tableId]);

  /**
   * Load, then auto-apply the default view — but ONLY when the user arrived
   * with a pristine URL.
   *
   * 🚨 A LINK ALWAYS WINS. If someone opened a URL that already carries a view
   * (a colleague's link, a bookmark, Back), applying their default over it
   * would silently show them something other than what they asked for. The
   * default is for "I just opened my table", never for "I followed a link".
   */
  const autoAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await load();
      if (cancelled) return;
      if (autoAppliedFor.current === tableId) return;
      autoAppliedFor.current = tableId;
      if (!viewIsPristine) return;
      const fallback = loaded.find((v) => v.isDefault);
      if (fallback) apply(fallback);
    })();
    return () => {
      cancelled = true;
    };
    // `viewIsPristine` is read at load time on purpose; it must not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, load]);

  const saveNew = useCallback(
    async (name: string) => {
      // The view belongs to the TABLE's organization — resolved here rather
      // than assumed from whatever org the person has active.
      const org = await getTableOrganizationId(tableId);
      if (!org.success) {
        toast({
          title: "Could not save this view",
          description: org.error,
          variant: "destructive",
        });
        return;
      }
      const result = await createSavedView({
        tableId,
        organizationId: org.data,
        name,
        definition: liveDefinition,
      });
      if (!result.success) {
        toast({
          title: "Could not save this view",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      await load();
      setActiveViewId(result.data.id);
      toast({ title: `Saved “${result.data.name}”` });
    },
    [liveDefinition, load, tableId],
  );

  const update = useCallback(
    async (view: SavedView) => {
      const result = await updateSavedViewDefinition({
        id: view.id,
        definition: liveDefinition,
      });
      if (!result.success) {
        toast({
          title: "Could not update this view",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      await load();
      toast({ title: `Updated “${view.name}”` });
    },
    [liveDefinition, load],
  );

  const rename = useCallback(
    async (view: SavedView, name: string) => {
      const result = await renameSavedView({ id: view.id, name });
      if (!result.success) {
        toast({
          title: "Could not rename this view",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      await load();
    },
    [load],
  );

  const setDefault = useCallback(
    async (view: SavedView, makeDefault: boolean) => {
      const result = await setDefaultSavedView({
        tableId,
        id: makeDefault ? view.id : null,
      });
      if (!result.success) {
        toast({
          title: "Could not change the default view",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      await load();
    },
    [load, tableId],
  );

  const remove = useCallback(
    async (view: SavedView) => {
      const result = await deleteSavedView({ id: view.id });
      if (!result.success) {
        toast({
          title: "Could not delete this view",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      if (activeViewId === view.id) setActiveViewId(null);
      await load();
      toast({ title: `Deleted “${view.name}”` });
    },
    [activeViewId, load],
  );

  return {
    views,
    loading,
    activeViewId,
    liveDefinition,
    apply,
    clearActive: useCallback(() => setActiveViewId(null), []),
    saveNew,
    update,
    rename,
    setDefault,
    remove,
  };
}

export type { SavedView, SavedViewDefinition };
