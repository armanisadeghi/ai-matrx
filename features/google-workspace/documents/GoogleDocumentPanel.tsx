"use client";

/**
 * Docs Plane A — the Linked document's body, its unavailable state, and the
 * Append composer, inside the Detail primitive.
 *
 * WHAT THIS IS NOT: a second detail screen. The header, the fields, the health
 * strip, the associations and the history are the primitive's fixed sections
 * (`lib/detail`); this component is the record type's own body, handed to the
 * primitive as ONE extra section. There is no bespoke Google document window.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Lock, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  appendGoogleDocument,
  approvalQueueHref,
  SENT_FOR_APPROVAL_MESSAGE,
} from "@/features/google-workspace/service";

import {
  appendPromiseSentence,
  composeAppendBlock,
  type AppendHeadingMode,
} from "./appendBlock";
import { useGoogleDocsKnobs } from "./knobs";
import { GOOGLE_DOCUMENT_TABLE, isStaleForOpen, mimeKindLabel, syncStatusOf } from "./record";
import {
  archiveSyncedRecord,
  detachSyncedRecord,
  refreshGoogleDocument,
  readGoogleDocumentRow,
} from "./service";
import { announceDocumentRefreshed, subscribeToDocumentRefresh } from "./refreshBus";
import type { GoogleDocumentRow } from "./types";

/**
 * The two actions that are DOORS somewhere else. The other two — "Keep as AI
 * Matrx data" and "Archive" — are real calls now (B-29) and are rendered as
 * buttons below, each naming what it costs before it runs.
 */
const UNAVAILABLE_LINKS = [
  {
    id: "reconnect",
    label: "Reconnect Google",
    does: "Sign in to Google again and try this document once more.",
    /** A real door — the connectors screen owns reconnecting. */
    href: "/user-settings/integrations",
  },
  {
    id: "choose-again",
    label: "Choose the file again",
    does:
      "Pick the file in Google Picker again, which is what restores our access when it was moved or re-shared.",
    href: "/user-settings/integrations",
  },
] as const;

/**
 * 🚨 A DESTRUCTIVE OR IRREVERSIBLE CLICK NAMES ITS CONSEQUENCE FIRST
 * (`common-docs/policies/destructive-and-expensive-actions.md`). Neither of these
 * is a generic "Are you sure?": each one says what is lost, what is kept, and
 * what happens in Google — which is nothing, ever.
 */
function KeepAndArchiveActions({
  row,
  onDetached,
  onArchived,
}: {
  row: GoogleDocumentRow;
  onDetached: () => void;
  onArchived: (sentence: string) => void;
}) {
  const [running, setRunning] = useState<"keep" | "archive" | null>(null);
  const noun = mimeKindLabel(row.mime_kind);
  const detached = syncStatusOf(row) === "detached";

  const keep = async () => {
    const ok = await confirm({
      title: "Keep as AI Matrx data",
      description:
        `This ${noun} stops refreshing from Google and keeps exactly what it has today — the text below, ` +
        `its owner and the date it was last edited. Nothing changes in your Google account, and nothing here ` +
        `is deleted. It cannot be undone from this screen: to sync from Google again you pick the file in ` +
        `Google once more.`,
      confirmLabel: "Keep as AI Matrx data",
    });
    if (!ok) return;
    setRunning("keep");
    try {
      const result = await detachSyncedRecord({
        // THE RECORD'S OWN ORGANIZATION, like every other call in this panel.
        table: GOOGLE_DOCUMENT_TABLE,
        recordId: row.id,
        organizationId: row.organization_id,
      });
      toast.success(
        result.changed
          ? `Kept as AI Matrx data. This ${noun} no longer refreshes from Google.`
          : `This ${noun} was already kept as AI Matrx data.`,
      );
      onDetached();
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: "Archive this record",
      description:
        `The record goes out of the way and stays recoverable from the archive — nothing here is destroyed, and ` +
        `your file in Google is untouched. It will stop appearing in lists and in this panel until it is restored.`,
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    setRunning("archive");
    try {
      const result = await archiveSyncedRecord({
        table: GOOGLE_DOCUMENT_TABLE,
        recordId: row.id,
        organizationId: row.organization_id,
      });
      toast.success(
        result.changed ? "Archived. It is recoverable from the archive." : "This record was already archived.",
      );
      onArchived(
        "Archived. It is out of the way and recoverable from the archive; your file in Google is untouched.",
      );
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-google-document-record-actions>
      {detached ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={running !== null}
          onClick={() => void keep()}
          data-google-document-keep
        >
          <Lock className="mr-1.5 h-3.5 w-3.5" />
          {running === "keep" ? "Keeping…" : "Keep as AI Matrx data"}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running !== null}
        onClick={() => void archive()}
        data-google-document-archive
      >
        <Archive className="mr-1.5 h-3.5 w-3.5" />
        {running === "archive" ? "Archiving…" : "Archive this record"}
      </Button>
    </div>
  );
}

function UnavailableNotice({
  row,
  onDetached,
  onArchived,
}: {
  row: GoogleDocumentRow;
  onDetached: () => void;
  onArchived: (sentence: string) => void;
}) {
  return (
    <div
      className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
      data-google-document-unavailable
    >
      <p className="flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>
          {row.sync_status_reason?.trim() ||
            "Google would not give us this file the last time we asked, and did not say why."}{" "}
          The copy below is what we held when it last worked.
        </span>
      </p>
      <ul className="space-y-2">
        {UNAVAILABLE_LINKS.map((action) => (
          <li key={action.id} className="text-xs text-muted-foreground">
            <a
              href={action.href}
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              {action.label}
            </a>
            <span> · {action.does}</span>
          </li>
        ))}
      </ul>
      <KeepAndArchiveActions row={row} onDetached={onDetached} onArchived={onArchived} />
    </div>
  );
}

/**
 * The TERMINAL state, and it is not a failure: the person chose it. Reconnecting
 * and re-picking are gone from here because neither would change this record —
 * the row's own sentence says what happened and what to do instead.
 */
function DetachedNotice({
  row,
  onDetached,
  onArchived,
}: {
  row: GoogleDocumentRow;
  onDetached: () => void;
  onArchived: (sentence: string) => void;
}) {
  return (
    <div
      className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
      data-google-document-detached
    >
      <p className="flex items-start gap-2 text-sm text-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {row.sync_status_reason?.trim() ||
            "This record is AI Matrx data now and no longer refreshes from Google."}{" "}
          To sync from Google again, pick the file in Google once more.
        </span>
      </p>
      <KeepAndArchiveActions row={row} onDetached={onDetached} onArchived={onArchived} />
    </div>
  );
}

function BodyView({ row }: { row: GoogleDocumentRow }) {
  const body = row.body_text?.trim() ?? "";
  if (!body) {
    return (
      <p className="text-sm text-muted-foreground" data-google-document-body-empty>
        We have no copy of this document&apos;s text yet. Refresh it from Google above, or open it
        in Google.
      </p>
    );
  }
  return (
    <div
      className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed text-foreground"
      data-google-document-body
    >
      {body}
    </div>
  );
}

function AppendComposer({
  row,
  heading,
}: {
  row: GoogleDocumentRow;
  heading: AppendHeadingMode;
}) {
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [sending, setSending] = useState(false);
  const connectionId = row.synced_via_connection_id;
  const block = composeAppendBlock({ text, heading, now });

  if (!connectionId) {
    return (
      <p className="text-sm text-muted-foreground" data-google-document-append-unavailable>
        Nothing can be added to this document from here until a Google account has refreshed it —
        we do not know which connection to write through.
      </p>
    );
  }

  const send = async () => {
    // The bytes we send are the bytes shown. `block` is the preview.
    if (!block) return;
    setSending(true);
    try {
      const outcome = await appendGoogleDocument(connectionId, row.external_id, block);
      if (outcome.proposed) {
        toast.info(SENT_FOR_APPROVAL_MESSAGE, {
          action: {
            label: "Open the queue",
            onClick: () => window.open(approvalQueueHref(outcome.assistId), "_blank"),
          },
        });
      } else {
        toast.success(`Added to the end of “${outcome.result.title}” in Google.`);
        announceDocumentRefreshed(row.id);
      }
      setText("");
      setNow(new Date());
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2" data-google-document-append>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setNow(new Date());
        }}
        placeholder="Add to the end of this doc…"
        rows={4}
        className="text-base"
        aria-label="Add to the end of this doc"
      />
      {block ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {appendPromiseSentence({ title: row.title, heading })}
          </p>
          <pre
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-foreground"
            data-google-document-append-preview
          >
            {block}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={sending} onClick={() => void send()}>
              {sending ? "Adding…" : "Append"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => {
                // "Edit" is the composer itself: the preview stays, the cursor
                // goes back to the text. No second editor.
                const field = document.querySelector<HTMLTextAreaElement>(
                  "[data-google-document-append] textarea",
                );
                field?.focus();
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={sending}
              onClick={() => setText("")}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Type what should be added and the exact block will be shown here before anything reaches
          Google.
        </p>
      )}
    </div>
  );
}

/**
 * The panel. Also the ONE place refresh-on-open happens: opening a record whose
 * last refresh is older than `google.refresh.on_open_min_age_seconds` spends one
 * Google call, and a fresher record spends none.
 */
export function GoogleDocumentPanel({ initialRow }: { initialRow: GoogleDocumentRow }) {
  const [row, setRow] = useState<GoogleDocumentRow>(initialRow);
  const { refreshOnOpenMinAgeSeconds, appendHeading, isResolving } = useGoogleDocsKnobs();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [archivedSentence, setArchivedSentence] = useState<string | null>(null);
  const openRefreshTried = useRef(false);

  const reload = useCallback(async () => {
    const fresh = await readGoogleDocumentRow(row.id);
    if (fresh) setRow(fresh);
  }, [row.id]);

  const refresh = useCallback(async () => {
    setRefreshError(null);
    try {
      // THE RECORD'S OWN ORGANIZATION, not the session's: this row belongs to one
      // organization and the server requires it explicitly.
      await refreshGoogleDocument({
        fileId: row.external_id,
        organizationId: row.organization_id,
      });
      await reload();
      announceDocumentRefreshed(row.id);
    } catch (error: unknown) {
      // NOTHING FAILS SILENTLY: a refresh that could not run says so in place,
      // and the copy we already hold stays on screen.
      setRefreshError(extractErrorMessage(error));
    }
  }, [reload, row.external_id, row.id]);

  useEffect(() => subscribeToDocumentRefresh(row.id, () => void reload()), [reload, row.id]);

  useEffect(() => {
    // Wait for the knob before deciding; a default-driven refresh on the first
    // paint would ignore an organization that raised the floor.
    if (isResolving || openRefreshTried.current) return;
    openRefreshTried.current = true;
    if (!isStaleForOpen(row.synced_at, refreshOnOpenMinAgeSeconds, new Date())) return;
    // A record kept as AI Matrx data never refreshes again — spending a Google
    // call here would be the screen undoing the person's choice.
    if (syncStatusOf(row) === "detached") return;
    void refresh();
  }, [isResolving, refresh, refreshOnOpenMinAgeSeconds, row.synced_at, row.sync_status]);

  const onDetached = useCallback(() => {
    void reload();
    announceDocumentRefreshed(row.id);
  }, [reload, row.id]);

  const onArchived = useCallback(
    (sentence: string) => {
      setArchivedSentence(sentence);
      // The rest of the primitive re-reads and finds the row gone, which is its
      // own honest absent state — this panel does not pretend the record is live.
      announceDocumentRefreshed(row.id);
    },
    [row.id],
  );

  const status = syncStatusOf(row);

  if (archivedSentence) {
    return (
      <p className="text-sm text-muted-foreground" data-google-document-archived>
        {archivedSentence}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {refreshError ? (
        <p className="text-xs text-destructive" data-google-document-refresh-error>
          {refreshError}
        </p>
      ) : null}
      {status === "detached" ? (
        <DetachedNotice row={row} onDetached={onDetached} onArchived={onArchived} />
      ) : status !== "available" ? (
        <UnavailableNotice row={row} onDetached={onDetached} onArchived={onArchived} />
      ) : null}
      <BodyView row={row} />
      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add to the end of this doc
        </h4>
        <AppendComposer row={row} heading={appendHeading} />
      </div>
    </div>
  );
}
