"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { useAppSelector } from "@/lib/redux/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Loader2, Clock, RotateCcw, GitCompareArrows, History, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { fetchVersions, restoreVersion } from "@/features/text-diff/service/versionService";
import type { NoteVersion } from "@/features/text-diff/types";
import type { Note } from "@/features/notes/types";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { analyzeDiff } from "@/features/notes/utils/diffAnalysis";
import { NoteDiffViewer } from "./NoteDiffViewer";

interface NoteVersionDiffPageProps {
  noteId: string;
}

export function NoteVersionDiffPage({ noteId }: NoteVersionDiffPageProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<"current" | number>("current");
  const [restoring, setRestoring] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"compare" | "history">("compare");

  const currentNote = useAppSelector(selectNoteById(noteId));

  // Fetch all versions on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVersions(noteId)
      .then((data) => {
        if (!cancelled) {
          setVersions(data);
          // Default to second version (one back from current)
          if (data.length > 0) {
            const currentVer = currentNote?.version;
            const best = currentVer != null
              ? data.find((v) => v.version_number !== currentVer)
              : data.length > 1 ? data[1] : data[0];
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
    return () => { cancelled = true; };
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

  // Build Note-shaped objects from version snapshots for the diff viewer
  const oldNote: Partial<Note> | null = leftSnapshot
    ? { content: leftSnapshot.content, label: leftSnapshot.label }
    : null;

  const newNote: Partial<Note> | null = rightVersion === "current" && currentNote
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
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoring(false);
      setShowRestoreDialog(false);
    }
  };

  // Version options for dropdowns
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

  const handleHistoryCompare = (version: number, compareToVersion: number | "current") => {
    setLeftVersion(version);
    setRightVersion(compareToVersion);
    setActiveTab("compare");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading version history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">{error}</div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No version history found for this note.
      </div>
    );
  }

  const leftLabel = leftSnapshot ? `Version ${leftSnapshot.version_number}` : "Select a version";
  const rightLabel = rightVersion === "current"
    ? `Current Note${currentNote?.version != null ? ` (v${currentNote.version})` : ""}`
    : `Version ${rightVersion}`;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "compare" | "history")} className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
          <TabsList className="h-7 p-0.5 bg-muted/50">
            <TabsTrigger value="compare" className="h-6 px-2 text-xs gap-1 data-[state=active]:bg-background">
              <GitCompareArrows className="w-3 h-3" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="history" className="h-6 px-2 text-xs gap-1 data-[state=active]:bg-background">
              <History className="w-3 h-3" />
              History
            </TabsTrigger>
          </TabsList>

          {activeTab === "compare" && (
            <>
              <div className="w-[220px]">
                <SearchableSelect
                  options={leftVersionOptions}
                  value={leftVersion?.toString() ?? undefined}
                  onChange={(opt) => startTransition(() => setLeftVersion(parseInt(opt.value, 10)))}
                  placeholder="Select version..."
                  searchPlaceholder="Search..."
                />
              </div>
              <span className="text-xs text-muted-foreground">vs</span>
              <div className="w-[260px]">
                <SearchableSelect
                  options={rightVersionOptions}
                  value={rightVersion.toString()}
                  onChange={(opt) => startTransition(() => setRightVersion(opt.value === "current" ? "current" : parseInt(opt.value, 10)))}
                  placeholder="Compare to..."
                  searchPlaceholder="Search..."
                />
              </div>

              {leftSnapshot && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {new Date(leftSnapshot.created_at).toLocaleString()}
                </div>
              )}

              <div className="flex-1" />

              {leftVersion != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => setShowRestoreDialog(true)}
                  disabled={restoring}
                >
                  {restoring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Restore v{leftVersion}
                </Button>
              )}
            </>
          )}
        </div>

        <TabsContent value="compare" className="flex-1 overflow-hidden mt-0">
          {oldNote && newNote ? (
            <NoteDiffViewer
              oldNote={oldNote}
              newNote={newNote}
              oldLabel={leftLabel}
              newLabel={rightLabel}
              className="h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a version to see differences
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-y-auto mt-0">
          <NoteHistoryTimeline
            versions={versions}
            currentVersion={currentNote?.version ?? null}
            onCompare={handleHistoryCompare}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current note content with the content from v{leftVersion}. The
              current content will be saved as a new version in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Restore v{leftVersion}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Inline history timeline — notes versions already include content so we can compute diffs directly */
function NoteHistoryTimeline({
  versions,
  currentVersion,
  onCompare,
}: {
  versions: NoteVersion[];
  currentVersion: number | null;
  onCompare: (version: number, compareTo: number | "current") => void;
}) {
  // Versions come sorted newest first
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);

  // Compute diffs between consecutive versions (we already have all content)
  const enriched = useMemo(() => {
    return sorted.map((v, i) => {
      const prev = sorted[i + 1];
      const diff = prev ? analyzeDiff(prev.content, v.content) : null;
      return { ...v, diff };
    });
  }, [sorted]);

  return (
    <div className="px-4 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-2 pr-3 font-medium w-[70px]">Version</th>
            <th className="text-left py-2 pr-3 font-medium w-[140px]">Date</th>
            <th className="text-left py-2 pr-3 font-medium w-[80px]">Source</th>
            <th className="text-left py-2 pr-3 font-medium">Changes</th>
            <th className="text-right py-2 font-medium w-[140px]">Compare</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {enriched.map((version, index) => {
            const isLatest = version.version_number === currentVersion;
            const date = new Date(version.created_at);
            const prevVersion = index < enriched.length - 1 ? enriched[index + 1] : null;

            return (
              <tr
                key={version.version_number}
                className={cn("group hover:bg-muted/20 transition-colors", isLatest && "bg-primary/5")}
              >
                <td className="py-2.5 pr-3">
                  <span className={cn("font-mono font-medium tabular-nums", isLatest && "text-primary")}>
                    v{version.version_number}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {date.toLocaleDateString()}{" "}
                  {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-[0.5625rem]",
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
                  {version.change_note && (
                    <div className="text-muted-foreground mb-0.5">{version.change_note}</div>
                  )}
                  {version.diff ? (
                    <span className="text-muted-foreground">
                      {version.diff.linesChanged} line{version.diff.linesChanged !== 1 ? "s" : ""}
                      {version.diff.charsChanged > 0 && ` · ${version.diff.charsChanged} chars`}
                      {!version.diff.hasChangesExcludingWhitespace && " (whitespace only)"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">Initial version</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {prevVersion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[0.5625rem] gap-0.5 text-muted-foreground"
                        onClick={() => onCompare(prevVersion.version_number, version.version_number)}
                      >
                        <ArrowRight className="w-2.5 h-2.5" />
                        v{prevVersion.version_number}
                      </Button>
                    )}
                    {!isLatest && currentVersion != null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[0.5625rem] gap-0.5 text-muted-foreground"
                        onClick={() => onCompare(version.version_number, "current")}
                      >
                        <GitCompareArrows className="w-2.5 h-2.5" />
                        Current
                      </Button>
                    )}
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
