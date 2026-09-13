"use client";

import { useEffect, useRef, useState } from "react";
import { SavedViewsControl, type TableSavedViewsProps } from "@ai-matrx/design-system/data-table";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  createPersonalTableView, listPersonalTableViews, updatePersonalTableView,
  type PersonalTableView, type TableViewActor,
} from "./table-saved-views-service";

/** One application adapter for every package table; no page-specific view UI. */
export function TableSavedViews(props: TableSavedViewsProps) {
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const organizationId = useAppSelector(selectOrganizationId);
  if (!userId || !accessToken) return <span role="status" className="text-xs text-muted-foreground">Sign in to use saved views.</span>;
  return <PersonalViews key={`${userId}:${props.tableId}`} {...props} actor={{ userId, accessToken, organizationId }} />;
}

function PersonalViews({ tableId, snapshot, defaultSnapshot, onApply, actor }: TableSavedViewsProps & { actor: TableViewActor }) {
  const [views, setViews] = useState<PersonalTableView[]>([]);
  // Pin the exact version the user selected. A list reload never silently advances it.
  const [active, setActive] = useState<PersonalTableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${actor.accessToken}:${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== requestKey;
  const pendingWrites = useRef(new Set<AbortController>());
  useEffect(() => {
    const writes = pendingWrites.current;
    return () => { for (const request of writes) request.abort(); };
  }, []);
  useEffect(() => {
    const request = new AbortController();
    void listPersonalTableViews(actor, tableId, request.signal).then((next) => {
      if (!request.signal.aborted) { setViews(next); setError(null); }
    }).catch((cause: unknown) => {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load saved views. Try reloading them.");
    }).finally(() => { if (!request.signal.aborted) setLoadedKey(requestKey); });
    return () => request.abort();
    // Organization changes do not change personal view ownership or list scope.
  }, [actor.userId, actor.accessToken, tableId, requestKey]);

  const save = async (name?: string) => {
    const request = new AbortController();
    pendingWrites.current.add(request);
    // Capture the initiating actor, organization and current layout before I/O.
    const capturedSnapshot = snapshot;
    const baseline = active;
    try {
      const saved = name === undefined && baseline
        ? await updatePersonalTableView(actor, tableId, baseline, capturedSnapshot, request.signal)
        : await createPersonalTableView(actor, tableId, name ?? "New view", capturedSnapshot, request.signal);
      if (request.signal.aborted) throw new Error("The view save was interrupted. Reload saved views before trying again.");
      setViews((previous) => [...previous.filter((view) => view.id !== saved.id), saved]);
      setActive(saved);
      setError(null);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not save this view. Your layout is unchanged.");
      throw cause;
    } finally { pendingWrites.current.delete(request); }
  };
  return <SavedViewsControl
    views={views}
    activeId={active?.id ?? null}
    dirty={active !== null && JSON.stringify(active.snapshot) !== JSON.stringify(snapshot)}
    loading={loading}
    error={error}
    onReload={() => setReloadKey((key) => key + 1)}
    onSelect={(id) => {
      try {
        const selected = id === null ? null : views.find((view) => view.id === id);
        if (selected === undefined) throw new Error("This view is no longer available. Reload saved views.");
        onApply(selected?.snapshot ?? defaultSnapshot);
        setActive(selected);
        setError(null);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this view. Your layout is unchanged."); }
    }}
    onSaveNew={(name) => save(name)}
    {...(active ? { onUpdate: () => save() } : {})}
  />;
}
