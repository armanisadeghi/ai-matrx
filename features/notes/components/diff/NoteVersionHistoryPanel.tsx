"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { useAppSelector } from "@/lib/redux/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Clock,
  RotateCcw,
  GitCompareArrows,
  History,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  fetchVersions,
  restoreVersion,
} from "@/features/text-diff/service/versionService";
import type { NoteVersion } from "@/features/text-diff/types";
import type { Note } from "@/features/notes/types";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { analyzeDiff } from "@/features/notes/utils/diffAnalysis";
import { NoteDiffViewer } from "./NoteDiffViewer";

export interface NoteVersionHistoryPanelProps {
  noteId: string;
  /** Side panel vs full /notes/[id]/diff route */
  variant?: "embedded" | "page";
  onVersionRestored?: (versionNumber: number) => void;
  className?: string;
}

export function NoteVersionHistoryPanel({
  noteId,
  variant = "embedded",
  onVersionRestored,
  className,
}: NoteVersionHistoryPanelProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<"current" | number>(
    "current",
  );
  const [restoring, setRestoring] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"compare" | "history">("compare");

  const currentNote = useAppSelector(selectNoteById(noteId));
  const isEmbedded = variant === "embedded";
  const isMobile = useIsMobile();
  const useStackedLayout = isMobile;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVersions(noteId)
      .then((data) => {
        if (!cancelled) {
          setVersions(data);
          if (data.length > 0) {
            const currentVer = currentNote?.version;
            const best =
              currentVer != null
                ? data.find((v) => v.version_number !== currentVer)
                : data.length > 1
                  ? data[1]
                  : data[0];
            setLeftVersion(best?.version_number ?? data[0].version_number);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load versions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const leftSnapshot = useMemo(
    () => versions.find((v) => v.version_number === leftVersion),
    [versions, leftVersion],
  );

  const rightSnapshot = useMemo(() => {
    if (rightVersion === "current") return null;
    return versions.find((v) => v.version_number === rightVersion) ?? null;
  }, [versions, rightVersion]);

  const oldNote: Partial<Note> | null = leftSnapshot
    ? { content: leftSnapshot.content, label: leftSnapshot.label }
    : null;

  const newNote: Partial<Note> | null =
    rightVersion === "current" && currentNote
      ? currentNote
      : rightSnapshot
        ? { content: rightSnapshot.content, label: rightSnapshot.label }
        : null;

  const handleRestore = async () => {
    if (!leftVersion) return;
    setRestoring(true);
    try {
      await restoreVersion(noteId, leftVersion);
      toast.success(`Restored to v${leftVersion}`);
      onVersionRestored?.(leftVersion);
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoring(false);
      setShowRestoreDialog(false);
    }
  };

  const leftVersionOptions: Option[] = versions.map((v) => ({
    value: v.version_number.toString(),
    label: `v${v.version_number}${v.change_note ? ` — ${v.change_note}` : ""}`,
  }));

  const rightVersionOptions: Option[] = [
    {
      value: "current",
      label: `Current Note${currentNote?.version != null ? ` (v${currentNote.version})` : ""}`,
    },
    ...versions.map((v) => ({
      value: v.version_number.toString(),
      label: `v${v.version_number}${v.change_note ? ` — ${v.change_note}` : ""}`,
    })),
  ];

  const handleHistoryCompare = (
    version: number,
    compareToVersion: number | "current",
  ) => {
    setLeftVersion(version);
    setRightVersion(compareToVersion);
    setActiveTab("compare");
  };

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center gap-2 text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm">Loading version history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-destructive",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        No version history found for this note.
      </div>
    );
  }

  const leftLabel = leftSnapshot
    ? `Version ${leftSnapshot.version_number}`
    : "Select a version";
  const rightLabel =
    rightVersion === "current"
      ? `Current Note${currentNote?.version != null ? ` (v${currentNote.version})` : ""}`
      : `Version ${rightVersion}`;

  const compareControls = (
    <div
      className={cn(
        "min-w-0",
        isEmbedded ? "flex flex-col gap-2" : "flex flex-1 items-center gap-3",
      )}
    >
      <div className={cn(isEmbedded ? "w-full" : "w-[220px]")}>
        <SearchableSelect
          options={leftVersionOptions}
          value={leftVersion?.toString() ?? undefined}
          onChange={(opt) =>
            startTransition(() => setLeftVersion(parseInt(opt.value, 10)))
          }
          placeholder="Select version..."
          searchPlaceholder="Search..."
        />
      </div>
      {!isEmbedded ? (
        <span className="text-xs text-muted-foreground">vs</span>
      ) : null}
      <div className={cn(isEmbedded ? "w-full" : "w-[260px]")}>
        <SearchableSelect
          options={rightVersionOptions}
          value={rightVersion.toString()}
          onChange={(opt) =>
            startTransition(() =>
              setRightVersion(
                opt.value === "current" ? "current" : parseInt(opt.value, 10),
              ),
            )
          }
          placeholder="Compare to..."
          searchPlaceholder="Search..."
        />
      </div>

      {leftSnapshot && !isEmbedded ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(leftSnapshot.created_at).toLocaleString()}
        </div>
      ) : null}

      {!isEmbedded ? <div className="flex-1" /> : null}

      {leftVersion != null && (
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5", isEmbedded && "w-full")}
          onClick={() => setShowRestoreDialog(true)}
          disabled={restoring}
        >
          {restoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore v{leftVersion}
        </Button>
      )}
    </div>
  );

  const compareViewer =
    oldNote && newNote ? (
      <NoteDiffViewer
        oldNote={oldNote}
        newNote={newNote}
        oldLabel={leftLabel}
        newLabel={rightLabel}
        className={useStackedLayout ? "min-h-[40dvh]" : "h-full"}
      />
    ) : (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          useStackedLayout ? "min-h-[24dvh]" : "h-full",
        )}
      >
        Select a version to see differences
      </div>
    );

  const restoreDialog = (
    <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Version</AlertDialogTitle>
          <AlertDialogDescription>
            This will replace the current note content with the content from v
            {leftVersion}. The current content will be saved as a new version in
            the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore} disabled={restoring}>
            {restoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Restore v{leftVersion}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (useStackedLayout) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-y-auto",
          className,
        )}
      >
        <section className="shrink-0 space-y-2 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Compare</h3>
          </div>
          {compareControls}
        </section>

        <section className="min-h-[40dvh] shrink-0 border-b border-border">
          {compareViewer}
        </section>

        <section className="shrink-0 py-2">
          <div className="flex items-center gap-2 px-3 pb-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">History</h3>
          </div>
          <NoteHistoryTimeline
            versions={versions}
            currentVersion={currentNote?.version ?? null}
            compact
            onCompare={handleHistoryCompare}
          />
        </section>

        {restoreDialog}
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "compare" | "history")}
        className="flex h-full min-h-0 flex-col"
      >
        <div
          className={cn(
            "shrink-0 border-b border-border bg-card/50",
            isEmbedded
              ? "flex flex-col gap-2 px-3 py-2"
              : "flex items-center gap-3 px-4 py-2",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <TabsList className="h-7 shrink-0 bg-muted/50 p-0.5">
              <TabsTrigger
                value="compare"
                className="h-6 gap-1 px-2 text-xs data-[state=active]:bg-background"
              >
                <GitCompareArrows className="h-3 w-3" />
                Compare
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-6 gap-1 px-2 text-xs data-[state=active]:bg-background"
              >
                <History className="h-3 w-3" />
                History
              </TabsTrigger>
            </TabsList>

            {isEmbedded ? (
              <Link
                href={`/notes/${noteId}/diff`}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Open full diff view"
              >
                <ExternalLink className="h-3 w-3" />
                Full view
              </Link>
            ) : null}
          </div>

          {activeTab === "compare" && compareControls}
        </div>

        <TabsContent
          value="compare"
          className="mt-0 min-h-0 flex-1 overflow-hidden"
        >
          {compareViewer}
        </TabsContent>

        <TabsContent
          value="history"
          className="mt-0 min-h-0 flex-1 overflow-y-auto"
        >
          <NoteHistoryTimeline
            versions={versions}
            currentVersion={currentNote?.version ?? null}
            compact={isEmbedded}
            onCompare={handleHistoryCompare}
          />
        </TabsContent>
      </Tabs>

      {restoreDialog}
    </div>
  );
}

function NoteHistoryTimeline({
  versions,
  currentVersion,
  compact = false,
  onCompare,
}: {
  versions: NoteVersion[];
  currentVersion: number | null;
  compact?: boolean;
  onCompare: (version: number, compareTo: number | "current") => void;
}) {
  const sorted = [...versions].sort(
    (a, b) => b.version_number - a.version_number,
  );

  const enriched = useMemo(() => {
    return sorted.map((v, i) => {
      const prev = sorted[i + 1];
      const diff = prev ? analyzeDiff(prev.content, v.content) : null;
      return { ...v, diff };
    });
  }, [sorted]);

  if (compact) {
    return (
      <div className="space-y-2 p-3">
        {enriched.map((version, index) => {
          const isLatest = version.version_number === currentVersion;
          const date = new Date(version.created_at);
          const prevVersion =
            index < enriched.length - 1 ? enriched[index + 1] : null;

          return (
            <div
              key={version.version_number}
              className={cn(
                "rounded-lg border border-border/60 bg-muted/20 p-2.5",
                isLatest && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "font-mono text-xs font-medium tabular-nums",
                        isLatest && "text-primary",
                      )}
                    >
                      v{version.version_number}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.5625rem] text-muted-foreground">
                      {version.change_source}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                    {date.toLocaleDateString()}{" "}
                    {date.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {version.diff ? (
                    <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                      {version.diff.linesChanged} line
                      {version.diff.linesChanged !== 1 ? "s" : ""}
                      {version.diff.charsChanged > 0 &&
                        ` · ${version.diff.charsChanged} chars`}
                    </p>
                  ) : (
                    <p className="mt-1 text-[0.6875rem] text-muted-foreground/50">
                      Initial version
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {prevVersion ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[0.625rem] gap-0.5"
                      onClick={() =>
                        onCompare(
                          prevVersion.version_number,
                          version.version_number,
                        )
                      }
                    >
                      <ArrowRight className="h-2.5 w-2.5" />v
                      {prevVersion.version_number}
                    </Button>
                  ) : null}
                  {!isLatest && currentVersion != null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[0.625rem] gap-0.5"
                      onClick={() =>
                        onCompare(version.version_number, "current")
                      }
                    >
                      <GitCompareArrows className="h-2.5 w-2.5" />
                      Current
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="w-[70px] py-2 pr-3 text-left font-medium">
              Version
            </th>
            <th className="w-[140px] py-2 pr-3 text-left font-medium">Date</th>
            <th className="w-[80px] py-2 pr-3 text-left font-medium">Source</th>
            <th className="py-2 pr-3 text-left font-medium">Changes</th>
            <th className="w-[140px] py-2 text-right font-medium">Compare</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {enriched.map((version, index) => {
            const isLatest = version.version_number === currentVersion;
            const date = new Date(version.created_at);
            const prevVersion =
              index < enriched.length - 1 ? enriched[index + 1] : null;

            return (
              <tr
                key={version.version_number}
                className={cn(
                  "group transition-colors hover:bg-muted/20",
                  isLatest && "bg-primary/5",
                )}
              >
                <td className="py-2.5 pr-3">
                  <span
                    className={cn(
                      "font-mono font-medium tabular-nums",
                      isLatest && "text-primary",
                    )}
                  >
                    v{version.version_number}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {date.toLocaleDateString()}{" "}
                  {date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[0.5625rem]",
                      version.change_source === "ai"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400"
                        : version.change_source === "system"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {version.change_source}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  {version.change_note ? (
                    <div className="mb-0.5 text-muted-foreground">
                      {version.change_note}
                    </div>
                  ) : null}
                  {version.diff ? (
                    <span className="text-muted-foreground">
                      {version.diff.linesChanged} line
                      {version.diff.linesChanged !== 1 ? "s" : ""}
                      {version.diff.charsChanged > 0 &&
                        ` · ${version.diff.charsChanged} chars`}
                      {!version.diff.hasChangesExcludingWhitespace &&
                        " (whitespace only)"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">
                      Initial version
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {prevVersion ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 gap-0.5 px-1.5 text-[0.5625rem] text-muted-foreground"
                        onClick={() =>
                          onCompare(
                            prevVersion.version_number,
                            version.version_number,
                          )
                        }
                      >
                        <ArrowRight className="h-2.5 w-2.5" />v
                        {prevVersion.version_number}
                      </Button>
                    ) : null}
                    {!isLatest && currentVersion != null ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 gap-0.5 px-1.5 text-[0.5625rem] text-muted-foreground"
                        onClick={() =>
                          onCompare(version.version_number, "current")
                        }
                      >
                        <GitCompareArrows className="h-2.5 w-2.5" />
                        Current
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="h-[50dvh]" />
    </div>
  );
}
