"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
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
import {
  useWorkingDocumentTurnSnapshots,
  type WorkingDocumentTurnSnapshot,
} from "./useWorkingDocumentTurnSnapshots";

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

function TurnSnapshotPanel({
  snapshots,
  onApplySnapshot,
  className,
}: {
  snapshots: WorkingDocumentTurnSnapshot[];
  onApplySnapshot?: (content: string) => void;
  className?: string;
}) {
  const [index, setIndex] = useState(() => Math.max(0, snapshots.length - 1));
  const [compareIndex, setCompareIndex] = useState<number | null>(() =>
    snapshots.length > 1 ? Math.max(0, snapshots.length - 2) : null,
  );

  useEffect(() => {
    setIndex(Math.max(0, snapshots.length - 1));
    setCompareIndex(
      snapshots.length > 1 ? Math.max(0, snapshots.length - 2) : null,
    );
  }, [snapshots.length]);

  const selected = snapshots[index] ?? null;
  const compare =
    compareIndex != null ? (snapshots[compareIndex] ?? null) : null;

  if (snapshots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No saved turn snapshots yet. Each user turn freezes the working document
        that reached the model.
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Snapshot
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous snapshot"
            disabled={index <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[5rem] text-center text-xs tabular-nums text-foreground">
            {index + 1} / {snapshots.length}
          </span>
          <button
            type="button"
            aria-label="Next snapshot"
            disabled={index >= snapshots.length - 1}
            onClick={() =>
              setIndex((i) => Math.min(snapshots.length - 1, i + 1))
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {selected
            ? `${selected.label} · ${formatWhen(selected.createdAt)}`
            : ""}
        </span>
        {onApplySnapshot && selected && selected.id !== "current" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={() => onApplySnapshot(selected.content)}
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
          {snapshots.map((snap, i) => (
            <option key={snap.id} value={i} disabled={i === index}>
              {snap.label}
              {snap.createdAt ? ` · ${formatWhen(snap.createdAt)}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {compare && selected ? (
          <DiffViewer
            original={compare.content}
            modified={selected.content}
            engine="light"
            language="markdown"
            originalLabel={compare.label}
            modifiedLabel={selected.label}
            defaultView="highlight"
            showToolbar
            className="h-full min-h-0"
          />
        ) : selected ? (
          <div className="h-full overflow-y-auto p-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {selected.content || "(empty)"}
            </pre>
          </div>
        ) : null}
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
  const snapshots = useWorkingDocumentTurnSnapshots(
    conversationId,
    currentContent,
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

  return (
    <TurnSnapshotPanel
      snapshots={snapshots}
      onApplySnapshot={onApplySnapshot}
      className="h-full"
    />
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
            Compare and restore prior working-document snapshots
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
      description="Cycle snapshots from each turn, or compare any two versions"
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
