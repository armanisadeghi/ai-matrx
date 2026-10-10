"use client";

/**
 * KindRecordChrome — the chrome a HOST draws under a rendered kind block whose
 * output was SAVED, or whose kind declares the `record` disposition.
 *
 * ## Why this is chrome and not part of any component
 *
 * THE WRAPPER LAW (`components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx`):
 * a kind component renders BARE and the host draws the frame. So the label, the
 * count link and the transition doors live here, and no kind component knows.
 *
 * ## Two stores during the transition (KINDS-GLUE wave 2 §7.3)
 *
 * The strip reads the message's landings ONCE (`fetchMessageLandings`) and picks
 * this block's by (kind, fingerprint) — never by block id:
 *
 *  - a RECORD-STORE output (the server lander's row in the kind's outputs table)
 *    says "Saved", and its Confirm, Archive and count go through the record
 *    store's own verbs (`keepStoreOutput`, `archiveStoreOutput`,
 *    `countStoreOutputs`). It never touches a `content_ir.kind_instance` door.
 *  - an OLD kind-store row keeps its old card and its old doors until wave 5.
 *  - neither: the strip says it was not saved and offers Save — door 5,
 *    `POST /kind-outputs/save`, which lands it in its kind's outputs table through
 *    the server's one lander, and answers whether it saved, was already saved
 *    (an earlier version of the block holds it) or why it was not.
 *
 * ## Never absent, never dead, never a false sentence
 *
 * While the read is in flight the strip says it is checking. If the read fails,
 * it says what went wrong and offers to try again.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Check, ExternalLink, RotateCw, Save } from "lucide-react";
import type { BlockOutcome, Landing } from "@ai-matrx/records/core";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  shapeInstancePermalink,
  shapeRecordsTableHref,
} from "@/features/content-ir/studio/constants";
import { tableHref as customTableHref } from "@/features/records-tool-display/readRecordsAnswer";
import { ConfirmationBadge } from "./ConfirmationBadge";
import { resolveKindRecordDisposition } from "./kind-record-registry";
import "./record-kinds";
import {
  archiveKindRecords,
  archiveStoreOutput,
  confirmKindRecords,
  countKindRecords,
  countStoreOutputs,
  fetchMessageLandings,
  keepStoreOutput,
  landingForBlock,
  notifyKindRecordsChanged,
  saveKindOutput,
  subscribeToKindRecordChanges,
} from "./kind-record-service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * True when the host should draw the strip for a kind with no saved output to
 * look for — a declared record kind. A block whose message has a durable id is
 * mounted regardless, and the strip draws only when that message's read names it.
 */
export function kindHasRecordChrome(kind: string | null | undefined): boolean {
  const disposition = resolveKindRecordDisposition(kind);
  // A table kind's rows are only ever found through the landing read; with no message to read
  // there is nothing honest to show for it.
  return disposition !== null && disposition.storage !== "table";
}

/** "flashcard_set" → "Flashcard Set". */
function humanize(kind: string): string {
  return kind
    .replace(/^table:.*/, "record")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

interface LoadState {
  status: "loading" | "ready" | "error";
  outcome: BlockOutcome;
  /** The count beside the "All N" link: the output's table for a store row, the kind store otherwise. */
  count: number | null;
  message: string | null;
}

const INITIAL: LoadState = {
  status: "loading",
  outcome: { state: "none" },
  count: null,
  message: null,
};

export function KindRecordChrome({
  kind,
  durableMessageId,
  conversationId,
  value: _value,
  fingerprint,
  className,
}: {
  kind: string;
  /** `chat.message.id` — DATABASE id only. Absent outside a conversation. */
  durableMessageId?: string;
  /** `chat.conversation.id` — a fork's copied outputs answer read-only. */
  conversationId?: string;
  /** The block's reconstructed value (kept for hosts; the strip reads the stores, not the block). */
  value?: Record<string, unknown> | null;
  /** The block envelope's fingerprint — what an output is matched by. */
  fingerprint?: string | null;
  className?: string;
}) {
  const disposition = resolveKindRecordDisposition(kind);
  /** A kind-store count exists only for a declared, kind-store record kind. */
  const countsInKindStore = disposition !== null && disposition.storage !== "table";
  const label = disposition?.label ?? humanize(kind);
  const labelPlural = disposition?.labelPlural ?? `${label}s`;
  const [state, setState] = useState<LoadState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /** Record ids this strip already announced on the bus, so a re-read never re-announces. */
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL);
    void (async () => {
      const read = durableMessageId
        ? await fetchMessageLandings(durableMessageId, conversationId ?? null)
        : { ok: true as const, value: { messageId: "", landings: [] as Landing[] } };
      if (cancelled) return;
      if (!read.ok) {
        setState({ ...INITIAL, status: "error", message: read.message });
        return;
      }
      const outcome = landingForBlock(read.value, { kind, fingerprint });
      const one = outcome.state === "landed" ? outcome.landing : null;
      const counted = one?.store === "record"
        ? await countStoreOutputs(one)
        : one?.store === "kind_instance" || countsInKindStore
          ? await countKindRecords({ kind })
          : ({ ok: true, value: 0 } as const);
      if (cancelled) return;
      setState({
        status: "ready",
        outcome,
        count: counted.ok ? counted.value : null,
        message: null,
      });
      /**
       * 🚨 A DISCOVERED OUTPUT ANNOUNCES ITSELF (V-45 §3.1): the server wrote it, so no client
       * write told the bus, and an earlier strip of the same kind would keep a stale count.
       * Once per record id, never on a re-read.
       */
      const found = outcome.state === "landed" ? [outcome.landing] : outcome.state === "several" ? outcome.landings : [];
      for (const landing of found) {
        if (!announcedRef.current.has(landing.recordId)) {
          announcedRef.current.add(landing.recordId);
          notifyKindRecordsChanged(kind);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, durableMessageId, conversationId, fingerprint, reloadKey, countsInKindStore]);

  const reload = () => setReloadKey((n) => n + 1);
  const [saveRefused, setSaveRefused] = useState<string | null>(null);
  /** The record that already holds this output (door 5 answered `already_saved`). */
  const [savedElsewhere, setSavedElsewhere] = useState<string | null>(null);

  /** THE SIBLING-COUNT RULE (V-42 §3.1): every strip re-reads on every record write. */
  useEffect(() => {
    return subscribeToKindRecordChanges((changed) => {
      if (changed === null || changed === kind) reload();
    });
  }, [kind]);

  const outcome = state.outcome;
  // Nothing landed and the kind declares nothing: this block is not a record at all.
  if (state.status === "ready" && outcome.state === "none" && !disposition) return null;
  if (state.status === "loading" && !disposition) return null;

  const landing: Landing | null = outcome.state === "landed" ? outcome.landing : null;
  const allLabel = (count: number) => `All ${count} ${count === 1 ? label : labelPlural}`;

  const onConfirm = async () => {
    if (!landing) return;
    setBusy(true);
    const result =
      landing.store === "record"
        ? await keepStoreOutput(landing)
        : await confirmKindRecords([landing.recordId]);
    setBusy(false);
    if (!result.ok) {
      toast.error(`Could not confirm this ${label}`, { description: result.message });
      return;
    }
    toast.success(`${label} confirmed`);
    reload();
  };

  const onArchive = async () => {
    if (!landing) return;
    const archiving = landing.state !== "archived";
    if (archiving) {
      const ok = await confirm({
        title: `Archive this ${label}?`,
        description: `It leaves your ${labelPlural} and their count. You can bring it back from the archive.`,
        confirmLabel: "Archive it",
      });
      if (!ok) return;
    }
    setBusy(true);
    const result =
      landing.store === "record"
        ? await archiveStoreOutput(landing, archiving)
        : await archiveKindRecords([landing.recordId], archiving);
    setBusy(false);
    if (!result.ok) {
      toast.error(`Could not ${archiving ? "archive" : "restore"} this ${label}`, {
        description: result.message,
      });
      return;
    }
    toast.success(archiving ? `${label} archived` : `${label} restored`);
    reload();
  };

  const canSave = Boolean(durableMessageId && fingerprint);
  const onSave = async () => {
    if (!durableMessageId || !fingerprint) return;
    setBusy(true);
    setSaveRefused(null);
    const result = await saveKindOutput({ messageId: durableMessageId, fingerprint, kind });
    setBusy(false);
    if (!result.ok) {
      toast.error(`Could not save this ${label}`, { description: result.message });
      return;
    }
    const answer = result.value;
    if (answer.landed.length > 0) {
      toast.success(`${label} saved`);
    } else if (answer.alreadySaved.length > 0) {
      // An earlier version of this block is the saved row (e.g. the answer was edited after it landed).
      setSavedElsewhere(answer.alreadySaved[0]);
    } else {
      setSaveRefused(answer.notSaved ?? `Your tables did not take this ${label}.`);
    }
    reload();
  };

  const countHref =
    landing?.store === "record" && landing.tableId
      ? customTableHref(landing.tableId)
      : shapeRecordsTableHref(kind);
  const recordHref =
    landing?.store === "record"
      ? landing.tableId
        ? customTableHref(landing.tableId, landing.recordId)
        : null
      : landing
        ? shapeInstancePermalink(landing.recordId)
        : null;
  const countLink =
    state.count !== null ? (
      <Link
        href={countHref}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {allLabel(state.count)}
      </Link>
    ) : null;
  const doorButton =
    "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:bg-accent";

  return (
    <div
      data-kind-record-chrome={kind}
      data-landing-store={landing?.store ?? "none"}
      className={cn(
        "mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      {state.status === "loading" && (
        <span className="text-muted-foreground">Checking your {labelPlural}…</span>
      )}

      {state.status === "error" && (
        <>
          <span className="text-muted-foreground">
            {state.message ?? `Your ${labelPlural} could not be read.`}
            <ErrorAlchemyMenu />
          </span>
          <button type="button" onClick={reload} className={doorButton}>
            <RotateCw className="h-3 w-3" aria-hidden />
            Try again
          </button>
        </>
      )}

      {state.status === "ready" && landing && landing.state === "unreadable" && (
        <span className="text-muted-foreground">
          {landing.refusal ?? `This ${label} could not be read.`}
        <ErrorAlchemyMenu error={landing.refusal} /></span>
      )}

      {state.status === "ready" && landing && landing.state !== "unreadable" && (
        <>
          {recordHref ? (
            <Link
              href={recordHref}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {landing.title?.trim() || `This ${label}`}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : (
            <span className="font-medium text-foreground">{landing.title?.trim() || `This ${label}`}</span>
          )}
          {landing.store === "record" ? (
            <span className="text-muted-foreground">Saved</span>
          ) : (
            <ConfirmationBadge confirmation={landing.unconfirmed ? "unconfirmed" : "confirmed"} />
          )}
          {landing.state === "archived" && <span className="text-muted-foreground">Archived</span>}
          {landing.fromSource && <span className="text-muted-foreground">From the original</span>}
          {countLink}
          {!landing.fromSource && (
            <span className="ml-auto flex items-center gap-1">
              {landing.unconfirmed === true && landing.state === "saved" && (
                <button type="button" onClick={onConfirm} disabled={busy} className={doorButton}>
                  <Check className="h-3 w-3" aria-hidden />
                  {busy ? "Working…" : "Confirm"}
                </button>
              )}
              <button type="button" onClick={onArchive} disabled={busy} className={doorButton}>
                {landing.state === "archived" ? (
                  <ArchiveRestore className="h-3 w-3" aria-hidden />
                ) : (
                  <Archive className="h-3 w-3" aria-hidden />
                )}
                {busy ? "Working…" : landing.state === "archived" ? "Restore" : "Archive"}
              </button>
            </span>
          )}
        </>
      )}

      {state.status === "ready" && outcome.state === "several" && (
        <>
          <span className="text-muted-foreground">
            This message produced {outcome.landings.length} {labelPlural} — open them to confirm each one.
          </span>
          {countLink}
        </>
      )}

      {state.status === "ready" && outcome.state === "none" && (
        <>
          <span data-error-box className="text-muted-foreground">
            {savedElsewhere ? "Already saved from an earlier version of this answer" : (saveRefused ?? "Not saved")}
          <ErrorAlchemyMenu /></span>
          {countLink}
          {canSave && !savedElsewhere && (
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={onSave} disabled={busy} className={doorButton}>
                <Save className="h-3 w-3" aria-hidden />
                {busy ? "Saving…" : "Save"}
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default KindRecordChrome;
