"use client";

/**
 * ConversationRecordsChip — the reverse view of the record chrome.
 *
 * The block strip answers "where did this record go?". This answers the
 * opposite question, and the one a person actually asks after a long chat:
 * "what did this conversation produce?" Every `content_ir.kind_instance` homed
 * in this conversation, or produced by one of its messages, listed with its
 * title, its kind, its confirmation badge and a link to the record itself.
 *
 * ## Why the header and not the transcript
 *
 * The transcript is the conversation; a running list of its by-products glued
 * above the composer would push the thing the reader came for off the screen and
 * grow without bound. In the header the list is one click away from every turn,
 * costs no vertical space, and stays reachable after the conversation is long
 * enough that its early blocks have scrolled out of reach — which is exactly
 * when the question gets asked.
 *
 * ## THE ARCHIVED-ITEMS LAW
 *
 * `common-docs/policies/archived-items.md`: the default list hides archived
 * records, the archived ones are one click away behind the canonical
 * `ArchivedDisclosure`, and the count it prints is the true number hidden.
 *
 * ## Honest empty state
 *
 * "None yet" is useless. When the conversation has produced nothing the panel
 * says what WOULD fill it, so a reader who expected something knows whether to
 * wait, to ask again, or to report a bug.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { ArchivedDisclosure } from "@ai-matrx/design-system";
import { ConfirmationBadge } from "@/features/content-ir/records/ConfirmationBadge";
import {
  fetchRecordsForConversation,
  subscribeToKindRecordChanges,
  type KindRecord,
} from "@/features/content-ir/records/kind-record-service";
import { shapeInstancePermalink } from "@/features/content-ir/studio/constants";

interface PanelState {
  status: "loading" | "ready" | "error";
  records: KindRecord[];
  message: string | null;
}

const INITIAL: PanelState = { status: "loading", records: [], message: null };

export function ConversationRecordsChip({
  conversationId,
}: {
  conversationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [state, setState] = useState<PanelState>(INITIAL);
  const [reloadKey, setReloadKey] = useState(0);

  // THE ZERO-PREFETCH RULE applies here too: nothing is read until the reader
  // opens the panel. A chat that never asks the question costs no query.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState(INITIAL);
    void (async () => {
      const result = await fetchRecordsForConversation(conversationId);
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", records: result.value, message: null }
          : { status: "error", records: [], message: result.message },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, reloadKey]);

  // A record saved from a block while this panel is open must not leave the
  // panel showing a list that is already false (THE RECORD CHANGE BUS).
  useEffect(() => {
    if (!open) return;
    return subscribeToKindRecordChanges(() => setReloadKey((n) => n + 1));
  }, [open]);

  const active = state.records.filter((r) => r.archivedAt === null);
  const archived = state.records.filter((r) => r.archivedAt !== null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-conversation-records-trigger
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Boxes className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Records</span>
          {state.status === "ready" && active.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
              {active.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 text-sm font-semibold text-foreground">
          Records this chat produced
        </div>

        {state.status === "loading" && (
          <p className="text-xs text-muted-foreground">Reading this chat…</p>
        )}

        {state.status === "error" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {state.message ??
                "This chat's records could not be read right now."}
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <RotateCw className="h-3 w-3" aria-hidden />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            {active.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing yet. When this chat produces a saved Shape — a wine
                tasting, a recipe, anything with its own record — it is kept
                here with a link straight to it.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {active.map((record) => (
                  <RecordRow key={record.id} record={record} />
                ))}
              </ul>
            )}
            <ArchivedDisclosure
              count={archived.length}
              open={showArchived}
              onOpenChange={setShowArchived}
              label="records"
              className="mt-3"
              contentClassName="space-y-1.5"
            >
              <ul className="space-y-1.5">
                {archived.map((record) => (
                  <RecordRow key={record.id} record={record} />
                ))}
              </ul>
            </ArchivedDisclosure>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RecordRow({ record }: { record: KindRecord }) {
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
