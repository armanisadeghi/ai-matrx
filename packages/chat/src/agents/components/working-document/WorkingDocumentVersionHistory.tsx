"use client";

import { useEffect, useState } from "react";
import { NoteVersionHistoryPanel } from "../../../next/lazy/NoteVersionHistoryPanel";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { DiffViewer } from "@ai-matrx/diff/react";
import { Button } from "@/components/ui/button";
import { cn } from "@ai-matrx/design-system";
import { useAppSelector } from "../../../store/hooks";
import {
  selectWorkingDocBinding,
  selectWorkingDocMaterialized,
} from "../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useWorkingDocumentVersions } from "./useWorkingDocumentVersions";
import { useWorkingDocument } from "../../hooks/useWorkingDocument";
import { setWorkingDocMainView } from "./workingDocumentViewStore";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

interface WorkingDocumentVersionHistoryProps {
  conversationId: string;
  /** A version was restored into the editor (the host closes its tab). */
  onRestored?: () => void;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Now";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * DB-backed version panel — the durable `history.row_versions` history for a
 * materialized working document. Metadata loads eagerly; the content of the two
 * versions on screen loads lazily (cached). "Restore" loads a prior version's
 * text back into the editor via the normal commit path (which captures a fresh
 * version, so history is never lost).
 */
function DbVersionPanel({
  documentId,
  currentContent,
  onApplySnapshot,
  className,
}: {
  documentId: string;
  currentContent: string;
  onApplySnapshot?: (content: string) => void;
  className?: string;
}) {
  const { versions, loading, error, getContent } =
    useWorkingDocumentVersions(documentId);

  // Indices into the newest-first `versions` array. Default: current (0) diffed
  // against the previous (1). Reset via the render-time adjust pattern (not an
  // effect) when the document or version count changes.
  const [index, setIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [selKey, setSelKey] = useState("");
  const resetKey = `${documentId}:${versions.length}`;
  if (resetKey !== selKey) {
    setSelKey(resetKey);
    setIndex(0);
    setCompareIndex(versions.length > 1 ? 1 : null);
  }

  const selected = versions[index] ?? null;
  const compare =
    compareIndex != null ? (versions[compareIndex] ?? null) : null;

  // Lazily fetched content for the OLDER (non-current) versions on screen. The
  // current version's text is the live `currentContent`, so it needs no fetch.
  // setState happens only in the async callback (never synchronously in the
  // effect), and `resolving` is derived — the sanctioned data-fetch pattern.
  const [fetched, setFetched] = useState<Record<number, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    const targets = [selected, compare].filter(
      (v): v is (typeof versions)[number] =>
        !!v && !v.isCurrent && !(v.version in fetched),
    );
    if (targets.length === 0) return;
    Promise.all(
      targets.map((v) =>
        getContent(v.version).then((c) => [v.version, c] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) {
        setFetched((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, compare, getContent, fetched]);

  const contentFor = (v: (typeof versions)[number] | null): string | null =>
    v == null
      ? null
      : v.isCurrent
        ? currentContent
        : v.version in fetched
          ? fetched[v.version]
          : null;
  const selectedContent = contentFor(selected);
  const compareContent = contentFor(compare);
  const resolving =
    (!!selected && !selected.isCurrent && !(selected.version in fetched)) ||
    (!!compare && !compare.isCurrent && !(compare.version in fetched));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading version history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
        {error}
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No versions yet. Each edit by you or the agent is saved here.
      </div>
    );
  }

  const labelFor = (v: (typeof versions)[number]) =>
    `v${v.version}${v.isCurrent ? " · Current" : ""}`;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Version
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Newer version"
            disabled={index <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[5rem] text-center text-xs tabular-nums text-foreground">
            {index + 1} / {versions.length}
          </span>
          <button
            type="button"
            aria-label="Older version"
            disabled={index >= versions.length - 1}
            onClick={() =>
              setIndex((i) => Math.min(versions.length - 1, i + 1))
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {selected
            ? `${labelFor(selected)} · ${formatWhen(selected.occurredAt)}`
            : ""}
        </span>
        {onApplySnapshot && selected && !selected.isCurrent && (
          <Button
            icon={<RotateCcw />}
            type="button"
            variant="outline"
            disabled={resolving || selectedContent == null}
            className="ml-auto"
            onClick={() => {
              if (selectedContent != null) onApplySnapshot(selectedContent);
            }}
          >
            Restore
          </Button>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Compare to
        </span>
        <select
          value={compareIndex ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setCompareIndex(v === "" ? null : Number(v));
          }}
          className="min-w-[8rem] rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Nothing</option>
          {versions.map((v, i) => (
            <option key={v.version} value={i} disabled={i === index}>
              {labelFor(v)}
              {` · ${formatWhen(v.occurredAt)}`}
            </option>
          ))}
        </select>
        {resolving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {compare && selected && compareContent != null && selectedContent != null ? (
          <DiffViewer
            original={compareContent}
            modified={selectedContent}
            engine="light"
            language="markdown"
            originalLabel={labelFor(compare)}
            modifiedLabel={labelFor(selected)}
            defaultView="highlight"
            showToolbar
            className="h-full min-h-0"
          />
        ) : selected && selectedContent != null ? (
          <div className="h-full overflow-y-auto p-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {selectedContent || "(empty)"}
            </pre>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryBody({
  conversationId,
  currentContent,
  onApplySnapshot,
}: {
  conversationId: string;
  currentContent: string;
  onApplySnapshot?: (content: string) => void;
}) {
  const binding = useAppSelector(
    selectWorkingDocBinding(conversationId, "working"),
  );
  // A reserved-but-unwritten document (a new chat) has an id but no row, so
  // `version_list` can only refuse it ("access denied") — there is nothing to
  // read yet. Ask only once the row exists.
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, "working"),
  );

  if (binding.kind === "note" && binding.id) {
    return (
      <NoteVersionHistoryPanel
        noteId={binding.id}
        variant="embedded"
        onVersionRestored={() => undefined}
        className="h-full"
      />
    );
  }

  if (binding.kind === "cx_working_document" && binding.id && materialized) {
    return (
      <DbVersionPanel
        documentId={binding.id}
        currentContent={currentContent}
        onApplySnapshot={onApplySnapshot}
        className="h-full"
      />
    );
  }

  // Not yet materialized — no durable versions to show.
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {/* read-gate-exempt: the document has no durable row yet (binding not materialized), so there is no read; DbVersionPanel shows its own read failure */}
      No versions yet. Each edit by you or the agent is saved here.
    </div>
  );
}

/**
 * A conversation's working-document version history — a plain body the host
 * shows as a canvas tab (kind `working-document-history`, one per
 * conversation) beside the document. It reads the document through the same
 * `useWorkingDocument` every editor mount shares, so "Restore" writes through
 * the normal commit path (which captures a fresh version — history is never
 * lost) and returns the person to the editor.
 */
export function WorkingDocumentVersionHistory({
  conversationId,
  onRestored,
}: WorkingDocumentVersionHistoryProps) {
  const { draft, onChange, flush, viewOnly } = useWorkingDocument(conversationId, "working");
  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <HistoryBody
        conversationId={conversationId}
        currentContent={draft}
        // Applying a snapshot is a WRITE — absent for view-only sharees (their
        // commit would be RLS-refused).
        onApplySnapshot={
          viewOnly
            ? undefined
            : (snapshotContent) => {
                onChange(snapshotContent);
                flush();
                setWorkingDocMainView(conversationId, "editor");
                onRestored?.();
              }
        }
      />
    </div>
  );
}
