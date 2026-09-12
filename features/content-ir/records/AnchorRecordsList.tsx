"use client";

/**
 * AnchorRecordsList — THE ONE reverse view of a record's anchor.
 *
 * "What did this produce?" is one question, and it has one answer component.
 * A conversation asks it about a chat; a web site asks it about a site; the
 * next anchor will ask it about whatever it is. The anchor is a token + an id
 * (`RecordAnchor`), the read is `fetchRecordsForAnchor`, and this renders the
 * result. There is deliberately no second list, no second badge, and no
 * per-anchor copy of any of it (DD-131 slice 2, item 4).
 *
 * The two hosts differ only in their CHROME: the chat header wraps this in a
 * popover, a site page wraps it in a section card. Neither one re-implements
 * a row, an empty state, or an archive control.
 *
 * ## THE ARCHIVED-ITEMS LAW
 *
 * `common-docs/policies/archived-items.md`: the default list hides archived
 * records, the archived ones are ONE click away behind the canonical
 * `ArchivedDisclosure`, and the count it prints is the true number hidden.
 *
 * ## Nothing fails silently
 *
 * A read that fails says what failed and offers Try again — it never renders
 * as "nothing here". An empty list says what WOULD fill it, so a reader who
 * expected something knows whether to wait, to act, or to report a bug.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { ArchivedDisclosure } from "@ai-matrx/design-system";
import { ConfirmationBadge } from "@/features/content-ir/records/ConfirmationBadge";
import {
  fetchRecordsForAnchor,
  subscribeToKindRecordChanges,
  type KindRecord,
  type RecordAnchor,
} from "@/features/content-ir/records/kind-record-service";
import { shapeInstancePermalink } from "@/features/content-ir/studio/constants";

export interface AnchorRecordsState {
  status: "loading" | "ready" | "error";
  /** Every record, archived included — the two lists below are derived. */
  records: KindRecord[];
  active: KindRecord[];
  archived: KindRecord[];
  message: string | null;
  reload: () => void;
}

const EMPTY: KindRecord[] = [];

/** One completed read, stamped with the request it answers. */
interface Answer {
  key: string;
  ok: boolean;
  records: KindRecord[];
  message: string | null;
}

/**
 * Read an anchor's records, and keep them true while the reader is looking.
 *
 * `enabled` is THE ZERO-PREFETCH RULE made explicit: a popover that is never
 * opened costs no query. A section that is on the page passes `true`.
 */
export function useAnchorRecords(
  anchor: RecordAnchor | null,
  enabled = true,
): AnchorRecordsState {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const anchorType = anchor?.type ?? null;
  const anchorId = anchor?.id ?? null;
  // The request said ONCE. An answer is rendered only while it still answers
  // the question being asked, so switching anchor (or asking again) reads as
  // "loading" WITHOUT a reset write in the effect body — the cascading-render
  // pattern React now refuses.
  const requestKey =
    enabled && anchorType && anchorId
      ? `${anchorType}:${anchorId}:${reloadKey}`
      : null;

  useEffect(() => {
    if (!requestKey || !anchorType || !anchorId) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchRecordsForAnchor({
        type: anchorType,
        id: anchorId,
      });
      if (cancelled) return;
      setAnswer(
        result.ok
          ? { key: requestKey, ok: true, records: result.value, message: null }
          : {
              key: requestKey,
              ok: false,
              records: EMPTY,
              message: result.message,
            },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, anchorType, anchorId]);

  // A record saved, confirmed or archived elsewhere must not leave this list
  // showing something that is already false (THE RECORD CHANGE BUS).
  useEffect(() => {
    if (!enabled) return;
    return subscribeToKindRecordChanges(() => setReloadKey((n) => n + 1));
  }, [enabled]);

  const current = answer && answer.key === requestKey ? answer : null;
  const status: "loading" | "ready" | "error" = !current
    ? "loading"
    : current.ok
      ? "ready"
      : "error";
  const records = current?.records ?? EMPTY;
  const message = current?.message ?? null;

  return {
    status,
    records,
    active: records.filter((r) => r.archivedAt === null),
    archived: records.filter((r) => r.archivedAt !== null),
    message,
    reload,
  };
}

export interface AnchorRecordsListProps {
  state: AnchorRecordsState;
  /** What this list is reading, in words — used in the loading sentence. */
  loadingText: string;
  /** What WOULD fill this list, in words. Never "None yet". */
  emptyText: string;
  /** The noun the archive disclosure counts. */
  label?: string;
  className?: string;
}

export function AnchorRecordsList({
  state,
  loadingText,
  emptyText,
  label = "records",
  className,
}: AnchorRecordsListProps) {
  const [showArchived, setShowArchived] = useState(false);

  if (state.status === "loading") {
    return <p className="text-xs text-muted-foreground">{loadingText}</p>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-xs text-muted-foreground">
          {state.message ?? "These records could not be read right now."}
        </p>
        <button
          type="button"
          onClick={state.reload}
          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <RotateCw className="h-3 w-3" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {state.active.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {state.active.map((record) => (
            <AnchorRecordRow key={record.id} record={record} />
          ))}
        </ul>
      )}
      <ArchivedDisclosure
        count={state.archived.length}
        open={showArchived}
        onOpenChange={setShowArchived}
        label={label}
        className="mt-3"
        contentClassName="space-y-1.5"
      >
        <ul className="space-y-1.5">
          {state.archived.map((record) => (
            <AnchorRecordRow key={record.id} record={record} />
          ))}
        </ul>
      </ArchivedDisclosure>
    </div>
  );
}

function AnchorRecordRow({ record }: { record: KindRecord }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Link
          href={shapeInstancePermalink(record.id)}
          className="block truncate text-xs font-medium text-foreground hover:underline"
        >
          {record.title?.trim() || "Untitled record"}
        </Link>
        <span className="block truncate text-[11px] text-muted-foreground">
          {record.kind || "unknown Shape"}
        </span>
      </div>
      <ConfirmationBadge
        confirmation={record.confirmation}
        className="shrink-0"
      />
    </li>
  );
}
