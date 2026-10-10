"use client";

// features/start/useStartLayout.ts — read, seed and save this person's Start layout, and its versions.
// Must sit under a records provider (StartPage's RecordsMount).
import { useEffect, useRef, useState } from "react";
import { listAppRows, upsertAppRow, useRecordsClient, useTypedTable, type RecordHistoryEntry } from "@ai-matrx/records/react";
import { readVersionNow } from "@ai-matrx/records/versions";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { startLayoutTable } from "./startLayout.typed-table";
import { useStartPage } from "./useStartPage";
import { parseStartDoc, sameStartDoc, serializeStartDoc } from "./widgets/doc";
import { summarizeStartEdit } from "./widgets/editNote";
import { defaultStartDoc } from "./widgets/defaultDoc";
import { browserLock, seedStartLayoutOnce } from "./widgets/seedOnce";
import { toast } from "@/lib/toast";
import type { StartDoc } from "./widgets/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export function useStartLayout() {
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const table = useTypedTable(startLayoutTable);
  const choice = useStartPage();
  const [saving, setSaving] = useState(false);
  const reloadedAfterSkip = useRef(false);
  // Set ONLY when the first-layout write truly failed: the one case the starting layout is shown as a stand-in.
  const [seedFailed, setSeedFailed] = useState(false);

  const mine = table.rows
    .filter((r) => r.person === userId)
    .sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
  const current = mine[0] ?? null;
  const parsed = current ? parseStartDoc(current.doc) : null;
  // The home organization: where her row already is, else where new things are saved.
  const homeOrg = current?._organizationId ?? client.config.organizationId ?? null;
  // No row yet and nothing wrong: the first read (or the seed that follows it) has not settled. The starting
  // layout is NEVER shown for that gap, or a reload that read no row yet looked like a different layout.
  const settling = Boolean(userId) && !current && !table.error && !seedFailed && Boolean(homeOrg);
  const loading = table.loading || choice.loading || settling;

  const save = async (doc: StartDoc, note: string, opts: { byAgent?: boolean } = {}): Promise<SaveResult> => {
    if (!userId) return { ok: false, error: "Sign in to save your start page." };
    if (!homeOrg) return { ok: false, error: "No organization to save your start page in." };
    // Nothing changed: no new version. (The first-layout seed has no current row, so it still writes.)
    if (parsed?.ok && sameStartDoc(parsed.doc, doc)) return { ok: true };
    setSaving(true);
    const row = { person: userId, doc: serializeStartDoc(doc), note, saved_at: new Date().toISOString() };
    const write = (data: typeof row) => upsertAppRow(client, startLayoutTable, data, { organizationId: homeOrg });
    // An agent's turn is written as the agent acting for this person (`_actor` / `_on_behalf_of` are the
    // store's envelope keys, lifted out before storage), so History reads "Agent for you".
    let answer = opts.byAgent
      ? await write({ ...row, _actor: "agent", _on_behalf_of: userId } as typeof row)
      : await write(row);
    // A store that refuses the agent stamp still keeps the change, said in the note.
    if (!answer.ok && opts.byAgent) answer = await write(row);
    setSaving(false);
    table.reload();
    return answer.ok ? { ok: true } : { ok: false, error: answer.error.message };
  };

  // First visit: write the default layout exactly once (per tab, across tabs, re-read fresh in the lock).
  const needsSeed = !loading && !table.error && Boolean(userId) && !current && Boolean(homeOrg);
  useEffect(() => {
    if (!needsSeed || !userId) return;
    void seedStartLayoutOnce({
      userId,
      lock: browserLock,
      hasRow: async () => {
        const listed = await listAppRows(client, startLayoutTable);
        return listed.ok && listed.data.rows.some((r) => r.person === userId);
      },
      write: () => save(defaultStartDoc(choice.pageId), "Starting layout"),
    }).then((outcome) => {
      if (outcome === "failed") {
        setSeedFailed(true);
        toast.error("Your start page could not be saved; showing the starting layout");
        return;
      }
      // Another tab (or an earlier mount) wrote it: read once more so this tab shows that row.
      if (outcome === "skipped" && !reloadedAfterSkip.current) {
        reloadedAfterSkip.current = true;
        table.reload();
      }
    });
  });

  // The active version, or nothing: never the starting layout as a guess for a row that is not there.
  const doc: StartDoc | null = parsed?.ok ? parsed.doc : current ? null : seedFailed ? defaultStartDoc(choice.pageId) : null;
  const noHome = Boolean(userId) && !current && !homeOrg && !table.loading;

  return {
    loading,
    saving,
    error:
      table.error?.message ??
      (parsed && !parsed.ok ? parsed.error : null) ??
      (noHome ? "No organization to save your start page in." : null),
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
  if (typeof note === "string" && note) return note;
  // No note moved (a write that repeated the last note): say what the LAYOUT change was.
  const doc = entry.changes.find((c) => c.key === "doc");
  if (doc) {
    const before = parseStartDoc(doc.before);
    const after = parseStartDoc(doc.after);
    if (after.ok) return before.ok ? summarizeStartEdit(before.doc, after.doc) : "Starting layout";
  }
  return entry.changes.length === 0 ? "Saved again, no change" : entry.operation_label;
}

export function useStartHistory(
  recordId: string | null,
  open: boolean,
  save: (doc: StartDoc, note: string) => Promise<SaveResult>,
) {
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

  /** Make `version` the active layout: a NEW version labeled "Restored vN", with that version's own note. */
  const setActive = async (version: number, seenVersion: number | null, currentDoc: StartDoc | null): Promise<SaveResult> => {
    if (!recordId) return { ok: false, error: "No saved layout yet." };
    const entry = entries?.find((e) => e.version === version);
    const answer = await setActiveVersion(client, recordId, version, seenVersion, {
      currentDoc,
      note: restoredNote(version, entry ? versionNote(entry) : null),
      save,
    });
    setRevision((n) => n + 1);
    return answer;
  };

  return { entries, error, preview, setActive, refresh: () => setRevision((n) => n + 1) };
}

/** The label a restore is saved with: "Restored v5", plus the note that version carried. */
export function restoredNote(version: number, versionsOwnNote: string | null): string {
  const own = versionsOwnNote?.trim();
  return own ? `Restored v${version}: ${own}` : `Restored v${version}`;
}

/**
 * Restore `version` as ONE new version, written through the normal save so it carries its own label and a
 * fresh saved time (a store-side restore copied the old note and the old saved time back, so the new
 * version read as "Starting layout" and the newest-row rule could pick another row). A preview's version
 * read can be missing (the page remounted between preview and press): read it now instead of refusing.
 */
export async function setActiveVersion(
  client: Pick<ReturnType<typeof useRecordsClient>, "recordHeaders" | "restorePreview">,
  recordId: string,
  version: number,
  seenVersion: number | null,
  write: { currentDoc: StartDoc | null; note: string; save: (doc: StartDoc, note: string) => Promise<SaveResult> },
): Promise<SaveResult> {
  const seen = seenVersion ?? (await readVersionNow(client, recordId));
  const now = await readVersionNow(client, recordId);
  if (seen === null || now === null) return { ok: false, error: "Could not check your layout for changes. Try again." };
  if (now !== seen) return { ok: false, error: "Your layout changed since you previewed it. Preview the version again." };
  const answer = await client.restorePreview({ record_id: recordId, version });
  if (!answer.ok) return { ok: false, error: answer.error.message };
  const change = answer.data.changes.find((c) => c.key === "doc");
  let doc = write.currentDoc;
  if (change) {
    const parsed = parseStartDoc(change.after);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    doc = parsed.doc;
  }
  if (!doc) return { ok: false, error: "No saved layout yet." };
  return write.save(doc, write.note);
}
