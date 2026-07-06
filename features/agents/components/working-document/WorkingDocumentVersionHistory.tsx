"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import {
  MatrxDynamicPanelHost,
  sidePanelWidthToPercent,
} from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocBinding } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useWorkingDocumentVersions } from "./useWorkingDocumentVersions";

const NoteVersionHistoryPanel = dynamic(
  () =>
    import("@/features/notes/components/diff/NoteVersionHistoryPanel").then(
      (m) => ({ default: m.NoteVersionHistoryPanel }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading version history…
      </div>
    ),
  },
);

interface WorkingDocumentVersionHistoryProps {
  conversationId: string;
  currentContent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplySnapshot?: (content: string) => void;
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
  // against the previous (1).
  const [index, setIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  useEffect(() => {
    setIndex(0);
    setCompareIndex(versions.length > 1 ? 1 : null);
  }, [versions.length, documentId]);

  const selected = versions[index] ?? null;
  const compare =
    compareIndex != null ? (versions[compareIndex] ?? null) : null;

  // Resolve the on-screen versions' content. The current (live) version prefers
  // the `currentContent` prop; older versions come from the snapshot RPC.
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const [compareContent, setCompareContent] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    const resolve = (v: (typeof versions)[number] | null) =>
      v == null
        ? Promise.resolve(null)
        : v.isCurrent
          ? Promise.resolve(currentContent)
          : getContent(v.version);
    Promise.all([resolve(selected), resolve(compare)])
      .then(([sel, cmp]) => {
        if (cancelled) return;
        setSelectedContent(sel);
        setCompareContent(cmp);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, compare, currentContent, getContent]);

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
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No versions yet. Each edit by you or the agent captures a durable version
        here.
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
            type="button"
            size="sm"
            variant="outline"
            disabled={resolving || selectedContent == null}
            className="ml-auto h-7 gap-1 text-xs"
            onClick={() => {
              if (selectedContent != null) onApplySnapshot(selectedContent);
            }}
          >
            <RotateCcw className="h-3 w-3" />
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

  if (binding.kind === "cx_working_document" && binding.id) {
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
      No versions yet. Once you or the agent edits this document, every change is
      captured here.
    </div>
  );
}

export function WorkingDocumentVersionHistory({
  conversationId,
  currentContent,
  open,
  onOpenChange,
  onApplySnapshot,
}: WorkingDocumentVersionHistoryProps) {
  const isMobile = useIsMobile();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const panelBody = useMemo(
    () => (
      <HistoryBody
        conversationId={conversationId}
        currentContent={currentContent}
        onApplySnapshot={onApplySnapshot}
      />
    ),
    [conversationId, currentContent, onApplySnapshot],
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[88dvh] gap-0 p-0">
          <DrawerTitle className="sr-only">
            Working document history
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Compare and restore prior working-document versions
          </DrawerDescription>
          <div className="flex h-11 shrink-0 items-center border-b border-border bg-muted/40 px-3">
            <span className="text-sm font-semibold text-foreground">
              Version history
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{panelBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  const minPct = sidePanelWidthToPercent(360, viewportWidth);
  const maxPct = sidePanelWidthToPercent(820, viewportWidth);
  const defaultPct = sidePanelWidthToPercent(
    520,
    viewportWidth,
    minPct,
    maxPct,
  );

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Version history"
      description="Cycle durable versions, or compare any two"
      expandButtonLabel="Version history"
      position="right"
      defaultSize={defaultPct}
      minSize={minPct}
      maxSize={maxPct}
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
      className="z-40"
    >
      {open ? panelBody : null}
    </MatrxDynamicPanelHost>
  );
}
