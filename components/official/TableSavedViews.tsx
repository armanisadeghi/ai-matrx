"use client";

import { useEffect, useRef, useState } from "react";
import { SavedViewsControl, sameTableView, type TableSavedViewsProps } from "@ai-matrx/design-system/data-table";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  archivePersonalTableView, createPersonalTableView, listPersonalTableViews, renamePersonalTableView, updatePersonalTableView,
  type PersonalTableView, type TableViewActor,
} from "./table-saved-views-service";

/** One application adapter for every package table; no page-specific view UI. */
export function TableSavedViews(props: TableSavedViewsProps) {
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const organizationId = useAppSelector(selectOrganizationId);
  if (!userId || !accessToken) return <span role="status" className="type-secondary text-muted-foreground">Sign in to use saved views.</span>;
  return <PersonalViews key={`${userId}:${props.tableId}`} {...props} actor={{ userId, accessToken, organizationId }} />;
}

function PersonalViews({ tableId, snapshot, defaultSnapshot, onApply, presentation, related, actor }: TableSavedViewsProps & { actor: TableViewActor }) {
  const [views, setViews] = useState<PersonalTableView[]>([]);
  // Pin the exact version the user selected. A list reload never silently advances it.
  const [active, setActive] = useState<PersonalTableView | null>(null);
  const activeRef = useRef<PersonalTableView | null>(null);
  const selectionRevision = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${actor.accessToken}:${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== requestKey;
  const pendingWrites = useRef(new Set<AbortController>());
  const completedWriteRevision = useRef(0);
  useEffect(() => {
    const writes = pendingWrites.current;
    return () => { for (const request of writes) request.abort(); };
  }, [actor.accessToken]);
  useEffect(() => {
    const request = new AbortController();
    const startedAtRevision = completedWriteRevision.current;
    void listPersonalTableViews(actor, tableId, request.signal).then((next) => {
      if (!request.signal.aborted && startedAtRevision === completedWriteRevision.current) { setViews(next); setError(null); }
    }).catch((cause: unknown) => {
      if (!request.signal.aborted && startedAtRevision === completedWriteRevision.current) setError(cause instanceof Error ? cause.message : "Could not load saved views. Try reloading them.");
    }).finally(() => { if (!request.signal.aborted) setLoadedKey(requestKey); });
    return () => request.abort();
    // Organization changes do not change personal view ownership or list scope.
  }, [actor.userId, actor.accessToken, tableId, requestKey]);

  const save = async (name?: string) => {
    const request = new AbortController();
    pendingWrites.current.add(request);
    // Capture the initiating actor, organization and current layout before I/O.
    const capturedSnapshot = snapshot;
    const baseline = activeRef.current;
    const startedAtSelection = selectionRevision.current;
    try {
      const saved = name === undefined && baseline
        ? await updatePersonalTableView(actor, tableId, baseline, capturedSnapshot, request.signal)
        : await createPersonalTableView(actor, tableId, name ?? "New view", capturedSnapshot, request.signal);
      if (request.signal.aborted) throw new Error("The view save was interrupted. Reload saved views before trying again.");
      completedWriteRevision.current += 1;
      setViews((previous) => [...previous.filter((view) => view.id !== saved.id), saved]);
      if (startedAtSelection === selectionRevision.current) { activeRef.current = saved; setActive(saved); }
      setError(null);
      setArchiveWarning(null);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not save this view. Your layout is unchanged.");
      throw cause;
    } finally { pendingWrites.current.delete(request); }
  };
  const rename = async (id: string, name: string) => {
    const baseline = views.find((view) => view.id === id);
    if (!baseline) throw new Error("This view is no longer available. Reload views before renaming it.");
    const request = new AbortController();
    pendingWrites.current.add(request);
    try {
      const saved = await renamePersonalTableView(actor, tableId, baseline, name, request.signal);
      if (request.signal.aborted) throw new Error("The rename was interrupted. Reload views before trying again.");
      completedWriteRevision.current += 1;
      setViews((previous) => previous.map((view) => view.id === id ? saved : view));
      if (activeRef.current?.id === id) { activeRef.current = saved; setActive(saved); }
      setError(null);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not rename this view.");
      throw cause;
    } finally { pendingWrites.current.delete(request); }
  };
  const remove = async (id: string) => {
    const baseline = views.find((view) => view.id === id);
    if (!baseline) throw new Error("This view is no longer available. Reload views before deleting it.");
    const request = new AbortController();
    pendingWrites.current.add(request);
    try {
      await archivePersonalTableView(actor, tableId, baseline, request.signal);
      if (request.signal.aborted) throw new Error("The delete was interrupted. Reload views before trying again.");
      completedWriteRevision.current += 1;
      const removingActiveView = activeRef.current?.id === id;
      let resetFailed = false;
      if (removingActiveView) {
        try { onApply(defaultSnapshot); }
        catch { resetFailed = true; }
      }
      setViews((previous) => previous.filter((view) => view.id !== id));
      if (removingActiveView) { activeRef.current = null; setActive(null); }
      setError(null);
      if (resetFailed) setArchiveWarning("The saved view was deleted, but the table could not return to Default. Save the current layout as a new view or reload this page.");
      else if (removingActiveView) setArchiveWarning(null);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not delete this view.");
      throw cause;
    } finally { pendingWrites.current.delete(request); }
  };
  return <SavedViewsControl
    views={views}
    activeId={active?.id ?? null}
    dirty={!sameTableView(active?.snapshot ?? defaultSnapshot, snapshot)}
    loading={loading}
    error={[error, archiveWarning].filter(Boolean).join(" ") || null}
    onReload={() => setReloadKey((key) => key + 1)}
    onSelect={(id) => {
      try {
        const selected = id === null ? null : views.find((view) => view.id === id);
        if (selected === undefined) throw new Error("This view is no longer available. Reload saved views.");
        onApply(selected?.snapshot ?? defaultSnapshot);
        selectionRevision.current += 1;
        activeRef.current = selected;
        setActive(selected);
        setError(null);
        setArchiveWarning(null);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this view. Your layout is unchanged."); }
    }}
    onSaveNew={(name) => save(name)}
    onRename={rename}
    onRemove={remove}
    related={related}
    {...(presentation ? { presentation } : {})}
    {...(active ? { onUpdate: () => save() } : {})}
  />;
}
