"use client";

/**
 * KindRecordChrome — the chrome a HOST draws under a rendered kind block whose
 * kind declares the `record` disposition.
 *
 * ## Why this is chrome and not part of any component
 *
 * THE WRAPPER LAW (`components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx`):
 * a kind component renders BARE and the host draws the frame. So the badge, the
 * count link and the two transition doors live here, keyed off the registry, and
 * `wine_tasting`'s component knows nothing about any of it. The day a second
 * kind declares itself a record it inherits this whole strip untouched.
 *
 * ## The button says what is actually true, and it is not always the same thing
 *
 * When the record EXISTS the button is "go look at it": the badge, the link to
 * the row, and the two transition doors.
 *
 * When it does NOT exist the button SAVES it, from the client, through the one
 * studio write contract. That is the case TODAY for every wine tasting written
 * in a chat: aidream's block detector claims no ordinary `__kind` body and
 * `wine_tasting` is not in its closed `BLOCK_KIND_MAP`, so the server never sees
 * a verified block and writes no row (proved against the real code, 2026-09-12).
 * The strip therefore never assumes; it LOOKS, and then says what it found.
 *
 * ## Never absent, never dead, never a false sentence
 *
 * There is no disabled button here and no greyed-out state. While the read is in
 * flight the strip says it is checking. If the read fails, the strip says what
 * went wrong in a sentence and offers to try again. If the row genuinely is not
 * there, it says THAT — it does not draw a Confirm button that would do nothing.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Check,
  ExternalLink,
  RotateCw,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  shapeInstancePermalink,
  shapeRecordsTableHref,
} from "@/features/content-ir/studio/constants";
import { ConfirmationBadge } from "./ConfirmationBadge";
import { resolveKindRecordDisposition } from "./kind-record-registry";
import "./record-kinds";
import {
  archiveKindRecords,
  confirmKindRecords,
  countKindRecords,
  fetchRecordsProducedByMessage,
  saveRecordFromBlock,
  subscribeToKindRecordChanges,
  type KindRecord,
} from "./kind-record-service";

/**
 * True when the host should draw the strip at all. Exported so the host can ask
 * the cheap question (a Map lookup) before mounting anything.
 */
export function kindHasRecordChrome(kind: string | null | undefined): boolean {
  return resolveKindRecordDisposition(kind) !== null;
}

interface LoadState {
  status: "loading" | "ready" | "error";
  /** The org-wide ACTIVE count of this kind's records. */
  count: number | null;
  /** Records this message produced of this kind. */
  records: KindRecord[];
  /** A reader-facing sentence, present only when something actually failed. */
  message: string | null;
}

const INITIAL: LoadState = {
  status: "loading",
  count: null,
  records: [],
  message: null,
};

export function KindRecordChrome({
  kind,
  messageId,
  conversationId,
  value,
  fingerprint,
  className,
}: {
  kind: string;
  /** `chat.message.id` — the provenance anchor. Absent outside a conversation. */
  messageId?: string;
  /** `chat.conversation.id` — the HOME a saved record is filed under. */
  conversationId?: string;
  /**
   * The block's reconstructed instance value. Present whenever the host could
   * read the region; absent means the block never parsed, and the strip says so
   * rather than offering a Save that would write nothing.
   */
  value?: Record<string, unknown> | null;
  /**
   * The block envelope's own fingerprint (`CanonicalBlockIR.fingerprint`) —
   * stored as `metadata.source.fingerprint`, the same key the server store
   * writes. Absent when the block carried no envelope, and then the key is
   * simply not written rather than invented.
   */
  fingerprint?: string | null;
  className?: string;
}) {
  const disposition = resolveKindRecordDisposition(kind);
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [state, setState] = useState<LoadState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!disposition) return;
    let cancelled = false;
    setState(INITIAL);
    void (async () => {
      const [countResult, recordsResult] = await Promise.all([
        organizationId
          ? countKindRecords({ kind, organizationId })
          : Promise.resolve({
              ok: false as const,
              message:
                "No organization is active, so these records cannot be counted. Pick an organization from the header and try again.",
            }),
        messageId
          ? fetchRecordsProducedByMessage({ kind, messageId })
          : Promise.resolve({ ok: true as const, value: [] as KindRecord[] }),
      ]);
      if (cancelled) return;
      const message = !countResult.ok
        ? countResult.message
        : !recordsResult.ok
          ? recordsResult.message
          : null;
      setState({
        status: message ? "error" : "ready",
        count: countResult.ok ? countResult.value : null,
        records: recordsResult.ok ? recordsResult.value : [],
        message,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [disposition, kind, messageId, organizationId, reloadKey]);

  const reload = () => setReloadKey((n) => n + 1);

  /**
   * 🚨 THE SIBLING-COUNT RULE. Two blocks of the same kind in one conversation
   * draw two of these strips, each holding its own copy of the organization's
   * count. Saving the first one used to leave the SECOND reading "Save this as
   * the first one" — false at the moment it was on screen, and only a full page
   * reload fixed it (V-42 §3.1). Every write announces itself on the record
   * bus; every strip listens, including the one that did the writing.
   */
  useEffect(() => {
    return subscribeToKindRecordChanges((changed) => {
      if (changed === null || changed === kind) reload();
    });
  }, [kind]);

  if (!disposition) return null;

  const tableHref = shapeRecordsTableHref(kind);
  /**
   * "All 1 Wine Tastings" is a small lie about English that makes a careful
   * screen look careless. One record takes the singular noun.
   */
  const allLabel = (count: number) =>
    `All ${count} ${count === 1 ? disposition.label : disposition.labelPlural}`;
  // A single produced record is the case the chrome is FOR: one block, one row.
  const record = state.records.length === 1 ? state.records[0] : null;

  const onConfirm = async () => {
    if (!record) return;
    setBusy(true);
    const result = await confirmKindRecords([record.id]);
    setBusy(false);
    if (!result.ok) {
      toast.error(`Could not confirm this ${disposition.label}`, {
        description: result.message,
      });
      return;
    }
    toast.success(`${disposition.label} confirmed`);
  };

  const onArchive = async () => {
    if (!record) return;
    const archiving = record.archivedAt === null;
    if (archiving) {
      const ok = await confirm({
        title: `Archive this ${disposition.label}?`,
        description: `It stops appearing in your ${disposition.labelPlural} and stops counting toward the total. Nothing is deleted — you can bring it back from the archive at any time.`,
        confirmLabel: "Archive it",
      });
      if (!ok) return;
    }
    setBusy(true);
    const result = await archiveKindRecords([record.id], archiving);
    setBusy(false);
    if (!result.ok) {
      toast.error(
        `Could not ${archiving ? "archive" : "restore"} this ${disposition.label}`,
        { description: result.message },
      );
      return;
    }
    toast.success(
      archiving
        ? `${disposition.label} archived`
        : `${disposition.label} restored`,
    );
  };

  const onSave = async () => {
    if (!value) return;
    setBusy(true);
    const result = await saveRecordFromBlock({
      kind,
      value,
      organizationId,
      conversationId,
      messageId,
      fingerprint: fingerprint ?? undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(`Could not save this ${disposition.label}`, {
        description: result.message,
      });
      return;
    }
    const standing =
      result.value.confirmation === "confirmed"
        ? "You saved it yourself, so it is already confirmed."
        : "It is waiting for someone to confirm it.";
    if (result.value.provenanceWarning) {
      // The row landed but its link back to this message did not. Never
      // silent: the record exists, and the reader is told what is missing.
      toast.warning(`${disposition.label} saved`, {
        description: `${standing} ${result.value.provenanceWarning}`,
      });
    } else {
      toast.success(`${disposition.label} saved`, { description: standing });
    }
  };

  return (
    <div
      data-kind-record-chrome={kind}
      className={cn(
        "mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      {state.status === "loading" && (
        <span className="text-muted-foreground">
          Checking your {disposition.labelPlural}…
        </span>
      )}

      {state.status === "error" && (
        <>
          <span className="text-muted-foreground">
            {state.message ??
              `Your ${disposition.labelPlural} could not be read.`}
          </span>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Try again
          </button>
        </>
      )}

      {state.status === "ready" && (
        <>
          {record ? (
            <>
              <Link
                href={shapeInstancePermalink(record.id)}
                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              >
                {record.title?.trim() || `This ${disposition.label}`}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
              <ConfirmationBadge confirmation={record.confirmation} />
              {record.archivedAt && (
                <span className="text-muted-foreground">Archived</span>
              )}
              <Link
                href={tableHref}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {allLabel(state.count ?? 0)}
              </Link>
              <span className="ml-auto flex items-center gap-1">
                {record.confirmation === "unconfirmed" && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    {busy ? "Working…" : "Confirm"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onArchive}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
                >
                  {record.archivedAt ? (
                    <ArchiveRestore className="h-3 w-3" aria-hidden />
                  ) : (
                    <Archive className="h-3 w-3" aria-hidden />
                  )}
                  {busy ? "Working…" : record.archivedAt ? "Restore" : "Archive"}
                </button>
              </span>
            </>
          ) : state.records.length > 1 ? (
            <>
              <span className="text-muted-foreground">
                This message produced {state.records.length}{" "}
                {disposition.labelPlural} — open them to confirm each one.
              </span>
              <Link
                href={tableHref}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {allLabel(state.count ?? 0)}
              </Link>
            </>
          ) : value ? (
            <>
              {/* NOT saved yet — so the control SAVES it. The first-one wording
                  is the honest one when the organization holds none: there is
                  no list to send anybody to yet. */}
              <button
                type="button"
                onClick={onSave}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
              >
                <Save className="h-3 w-3" aria-hidden />
                {busy
                  ? "Saving…"
                  : state.count === 0
                    ? "Save this as the first one"
                    : `Save this ${disposition.label}`}
              </button>
              {state.count !== null && state.count > 0 && (
                <Link
                  href={tableHref}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {allLabel(state.count)}
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                This block&apos;s data could not be read, so there is nothing to
                save from it. Open the message&apos;s raw view to see what
                arrived.
              </span>
              <Link
                href={tableHref}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {allLabel(state.count ?? 0)}
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default KindRecordChrome;
