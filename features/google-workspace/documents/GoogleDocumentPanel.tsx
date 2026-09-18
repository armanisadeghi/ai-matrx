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
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { isStaleForOpen, syncStatusOf } from "./record";
import { refreshGoogleDocument, readGoogleDocumentRow } from "./service";
import { announceDocumentRefreshed, subscribeToDocumentRefresh } from "./refreshBus";
import type { GoogleDocumentRow } from "./types";

/** The four things a person can do about a document Google will not give us. */
const UNAVAILABLE_ACTIONS = [
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
  {
    id: "keep",
    label: "Keep as AI Matrx data",
    does:
      "Stop refreshing and keep the copy below as ours. This is not wired up yet — nothing here deletes or changes it in the meantime.",
    href: null,
  },
  {
    id: "archive",
    label: "Archive this record",
    does:
      "Put the record out of the way without destroying it. This is not wired up yet — the record stays exactly as it is.",
    href: null,
  },
] as const;

function UnavailableNotice({ row }: { row: GoogleDocumentRow }) {
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
        {UNAVAILABLE_ACTIONS.map((action) => (
          <li key={action.id} className="text-xs text-muted-foreground">
            {action.href ? (
              <a
                href={action.href}
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                {action.label}
              </a>
            ) : (
              // NOT A DISABLED BUTTON. An action we have not built says so in
              // words instead of offering a control that does nothing (law 4).
              <span className="font-medium text-foreground">
                {action.label} — not wired up yet
              </span>
            )}
            <span> · {action.does}</span>
          </li>
        ))}
      </ul>
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
    void refresh();
  }, [isResolving, refresh, refreshOnOpenMinAgeSeconds, row.synced_at]);

  const status = syncStatusOf(row);

  return (
    <div className="space-y-4">
      {refreshError ? (
        <p className="text-xs text-destructive" data-google-document-refresh-error>
          {refreshError}
        </p>
      ) : null}
      {status !== "available" ? <UnavailableNotice row={row} /> : null}
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
