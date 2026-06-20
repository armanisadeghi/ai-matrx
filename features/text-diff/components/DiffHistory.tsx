"use client";

/**
 * DiffHistory Component
 *
 * Timeline view of note version history with restore functionality
 */

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchNoteVersions,
  restoreNoteVersion,
  selectNoteVersions,
  selectNoteVersionsLoading,
  selectNoteVersionsError,
} from "@/lib/redux/slices/noteVersionsSlice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  RotateCcw,
  User,
  Zap,
  Settings,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastManager } from "@/hooks/useToastManager";

export interface DiffHistoryProps {
  noteId: string;
  onRestoreVersion?: (versionNumber: number) => void;
  className?: string;
  /** When false, panel chrome supplies the title row. Default true. */
  showHeader?: boolean;
}

export function DiffHistory({
  noteId,
  onRestoreVersion,
  className,
  showHeader = true,
}: DiffHistoryProps) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("diff-history");

  const versionsRaw = useAppSelector(selectNoteVersions(noteId));
  const versions = versionsRaw ?? [];
  const loading = useAppSelector(selectNoteVersionsLoading(noteId));
  const error = useAppSelector(selectNoteVersionsError(noteId));
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(),
  );
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (
    id: string,
    content: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopiedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCopiedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  };

  useEffect(() => {
    if (noteId) {
      dispatch(fetchNoteVersions(noteId));
    }
  }, [noteId, dispatch]);

  const handleRestore = async (versionNumber: number) => {
    try {
      await dispatch(restoreNoteVersion({ noteId, versionNumber })).unwrap();

      toast.success(`Version ${versionNumber} restored successfully`);

      onRestoreVersion?.(versionNumber);

      // Refresh versions
      dispatch(fetchNoteVersions(noteId));
    } catch (err) {
      toast.error(
        `Failed to restore version: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "ai":
        return <Zap className="h-3.5 w-3.5 text-purple-500" />;
      case "system":
        return <Settings className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <User className="h-3.5 w-3.5 text-green-500" />;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "ai":
        return "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/30";
      case "system":
        return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30";
      default:
        return "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30";
    }
  };

  if (loading && versions.length === 0) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading version history...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="text-center text-red-600 text-sm">
          Error loading versions: {error}
        </div>
      </Card>
    );
  }

  if (versions.length === 0) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No version history yet</p>
          <p className="text-xs mt-1">
            Versions are created automatically when you save changes
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col p-0 min-h-0 h-full", className)}>
      {showHeader ? (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b border-border">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Version History</h3>
          <Badge variant="outline" className="text-xs">
            {versions.length} version{versions.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      ) : null}

      {/* Timeline */}
      <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
        <div className="p-3">
          <div className="space-y-1.5">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={cn(
                  "relative pl-5 pb-1.5",
                  index !== versions.length - 1 &&
                    "border-l-2 border-gray-200 dark:border-gray-700",
                )}
              >
                {/* Timeline dot */}
                <div className="absolute left-0 top-2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />

                {/* Version card */}
                <div className="bg-muted/50 rounded-lg overflow-hidden">
                  {/* Clickable header — two rows */}
                  <button
                    onClick={() => toggleExpanded(version.id)}
                    className="w-full flex flex-col px-2.5 py-1.5 hover:bg-muted/80 transition-colors text-left gap-0.5"
                  >
                    {/* Row 1: chevron + badges + actions */}
                    <div className="flex min-w-0 w-full flex-wrap items-center gap-1.5">
                      {expandedVersions.has(version.id) ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs font-mono shrink-0"
                      >
                        v{version.version_number}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs shrink-0",
                          getSourceColor(version.change_source),
                        )}
                      >
                        <span className="mr-1 flex items-center">
                          {getSourceIcon(version.change_source)}
                        </span>
                        {version.change_source}
                      </Badge>
                      {version.change_type && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {version.change_type}
                        </span>
                      )}
                      {/* spacer */}
                      <span className="flex-1" />
                      {/* copy */}
                      {version.content && (
                        <span
                          role="button"
                          onClick={(e) =>
                            handleCopy(version.id, version.content!, e)
                          }
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="Copy content"
                        >
                          {copiedIds.has(version.id) ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      )}
                      {/* restore */}
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(version.version_number);
                        }}
                        className="shrink-0 flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                        title="Restore this version"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </span>
                    </div>

                    {/* Row 2: label (truncated) + timestamp */}
                    <div className="flex items-center gap-2 w-full min-w-0 pl-4">
                      <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                        {version.label ?? ""}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                        {new Date(version.created_at).toLocaleString()}
                      </span>
                    </div>
                  </button>

                  {/* Expandable content */}
                  {expandedVersions.has(version.id) && (
                    <div className="px-2.5 pb-2.5 pt-1 border-t border-border/50 space-y-1.5">
                      {version.label && (
                        <p className="text-xs text-muted-foreground break-words">
                          {version.label}
                        </p>
                      )}
                      {version.content && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap break-all bg-background/60 rounded p-2 max-h-64 overflow-y-auto overflow-x-hidden">
                          {version.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
