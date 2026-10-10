"use client";

// features/start/useStartLayout.ts — read, seed and save this person's Start layout, and its versions.
// Must sit under a records provider (StartPage's RecordsMount).
import { useEffect, useRef, useState } from "react";
import { upsertAppRow, useRecordsClient, useTypedTable, type RecordHistoryEntry } from "@ai-matrx/records/react";
import { readVersionNow, restoreAt } from "@ai-matrx/records/versions";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { startLayoutTable } from "./startLayout.typed-table";
import { useStartPage } from "./useStartPage";
import { parseStartDoc, serializeStartDoc } from "./widgets/doc";
import { defaultStartDoc } from "./widgets/defaultDoc";
import type { StartDoc } from "./widgets/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export function useStartLayout() {
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const table = useTypedTable(startLayoutTable);
  const choice = useStartPage();
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  const mine = table.rows
    .filter((r) => r.person === userId)
    .sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
  const current = mine[0] ?? null;
  const parsed = current ? parseStartDoc(current.doc) : null;
  // The home organization: where her row already is, else where new things are saved.
  const homeOrg = current?._organizationId ?? client.config.organizationId ?? null;
  const loading = table.loading || choice.loading;

  const save = async (doc: StartDoc, note: string): Promise<SaveResult> => {
    if (!userId) return { ok: false, error: "Sign in to save your start page." };
    if (!homeOrg) return { ok: false, error: "No organization to save your start page in." };
    setSaving(true);
    const answer = await upsertAppRow(
      client,
      startLayoutTable,
      { person: userId, doc: serializeStartDoc(doc), note, saved_at: new Date().toISOString() },
      { organizationId: homeOrg },
    );
    setSaving(false);
    table.reload();
    return answer.ok ? { ok: true } : { ok: false, error: answer.error.message };
  };

  // First visit: write the default layout once (normal app first, then her old start data page).
  const needsSeed = !loading && !table.error && Boolean(userId) && !current && Boolean(homeOrg);
  useEffect(() => {
    if (!needsSeed || seeded.current) return;
    seeded.current = true;
    void save(defaultStartDoc(choice.pageId), "Starting layout");
  });

  const doc: StartDoc | null = parsed?.ok ? parsed.doc : current ? null : defaultStartDoc(choice.pageId);

  return {
    loading,
    saving,
    error: table.error?.message ?? (parsed && !parsed.ok ? parsed.error : null),
    doc,
    recordId: current?._id ?? null,
    save,
    reload: table.reload,
  };
}

/** Who wrote a version, as the person reads it. */
export function versionAuthor(entry: RecordHistoryEntry, userId: string | null): string {
  if (entry.actor.kind === "agent") return "Agent for you";
  if (entry.actor.kind === "system") return "System";
  if (entry.actor.user_id && entry.actor.user_id === userId) return "You";
  return entry.actor.name ?? "Someone";
}

/** The note a version was saved with, else the store's own word for the operation. */
export function versionNote(entry: RecordHistoryEntry): string {
  const note = entry.changes.find((c) => c.key === "note")?.after;
  return typeof note === "string" && note ? note : entry.operation_label;
}

export function useStartHistory(recordId: string | null, open: boolean) {
  const client = useRecordsClient();
  const [entries, setEntries] = useState<RecordHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open || !recordId) return;
    let live = true;
    void client.recordHistory({ record_id: recordId, limit: 50 }).then((answer) => {
      if (!live) return;
      if (answer.ok) {
        setEntries(answer.data);
        setError(null);
      } else setError(answer.error.message);
    });
    return () => {
      live = false;
    };
  }, [client, recordId, open, revision]);

  /** The doc as it stood at `version` (read-only), and the record's version when previewed. */
  const preview = async (
    version: number,
    currentDoc: StartDoc,
  ): Promise<{ ok: true; doc: StartDoc; seenVersion: number | null } | { ok: false; error: string }> => {
    if (!recordId) return { ok: false, error: "No saved layout yet." };
    const [answer, seenVersion] = await Promise.all([
      client.restorePreview({ record_id: recordId, version }),
      readVersionNow(client, recordId),
    ]);
    if (!answer.ok) return { ok: false, error: answer.error.message };
    const change = answer.data.changes.find((c) => c.key === "doc");
    if (!change) return { ok: true, doc: currentDoc, seenVersion };
    const parsed = parseStartDoc(change.after);
    return parsed.ok ? { ok: true, doc: parsed.doc, seenVersion } : { ok: false, error: parsed.error };
  };

  /** Make `version` the active layout — a NEW version; nothing is lost. */
  const setActive = async (version: number, seenVersion: number | null): Promise<SaveResult> => {
    if (!recordId) return { ok: false, error: "No saved layout yet." };
    const answer = await restoreAt(client, { record_id: recordId, version, seenVersion });
    setRevision((n) => n + 1);
    return answer.ok ? { ok: true } : { ok: false, error: answer.error.message };
  };

  return { entries, error, preview, setActive, refresh: () => setRevision((n) => n + 1) };
}
