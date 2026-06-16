// components/markdown-studio/SampleLibrarySheet.tsx
// Slide-in library of the user's saved markdown samples. Each card
// shows the title, description, block tag chips, and the relative
// updated timestamp. Click loads into the editor; row hover reveals
// rename + delete actions.

"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Clock,
  Edit2,
  Inbox,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useUserMarkdownSamples } from "./useUserMarkdownSamples";
import { getBlockTypeStyle } from "./block-type-colors";
import type { UserMarkdownSample } from "./user-samples-service";

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

interface SampleLibrarySheetProps {
  loadedSampleId: string | null;
  onLoad: (sample: UserMarkdownSample) => void;
}

export function SampleLibrarySheet({
  loadedSampleId,
  onLoad,
}: SampleLibrarySheetProps) {
  const { samples, isLoading, error, update, remove } = useUserMarkdownSamples();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<UserMarkdownSample | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = samples.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.detected_blocks.some((b) => b.toLowerCase().includes(q)) ||
      idMatchesQuery(s, q)
    );
  });

  const handleLoad = (sample: UserMarkdownSample) => {
    onLoad(sample);
    setOpen(false);
  };

  const handleDelete = async (sample: UserMarkdownSample) => {
    const ok = await confirm({
      title: "Delete sample?",
      description: `Permanently delete "${sample.name}". This cannot be undone.`,
      variant: "destructive",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await remove(sample.id);
      toast.success(`Deleted "${sample.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete sample",
      );
    }
  };

  const handleRename = async (newName: string) => {
    if (!renaming) return;
    setBusy(true);
    try {
      await update(renaming.id, { name: newName });
      toast.success(`Renamed to "${newName}"`);
      setRenaming(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename sample",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs font-medium"
        onClick={() => setOpen(true)}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Library
        {samples.length > 0 && (
          <Badge
            variant="secondary"
            className="ml-0.5 h-4 px-1 text-[10px]"
          >
            {samples.length}
          </Badge>
        )}
      </Button>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={setOpen}
        title={
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Your sample library
          </span>
        }
        description="Saved markdown samples — pick one to load into the editor."
        position="left"
        defaultSize={38}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
          <div className="px-4 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, description, or block tag…"
                className="pl-8 text-base h-9"
              />
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <ScrollArea className="flex-1 px-2 py-2">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading samples…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
                <div className="rounded-full bg-muted/40 p-3">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {samples.length === 0
                      ? "No samples yet"
                      : "No matches"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {samples.length === 0
                      ? "Save your first sample to start your personal library."
                      : "Try a different search term."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((sample) => {
                  const isLoaded = sample.id === loadedSampleId;
                  return (
                    <button
                      key={sample.id}
                      onClick={() => handleLoad(sample)}
                      className={cn(
                        "group w-full rounded-lg border px-3 py-2.5 text-left transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isLoaded
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : "border-transparent hover:border-border hover:bg-accent",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">
                              {sample.name}
                            </span>
                            {isLoaded && (
                              <Badge
                                variant="default"
                                className="h-4 px-1.5 text-[10px] font-medium"
                              >
                                loaded
                              </Badge>
                            )}
                          </div>
                          {sample.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 leading-snug">
                              {sample.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sample.detected_blocks
                              .slice(0, 4)
                              .map((tag) => {
                                const style = getBlockTypeStyle(tag);
                                return (
                                  <span
                                    key={tag}
                                    className={cn(
                                      "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
                                      style.bg,
                                      style.text,
                                      style.border,
                                    )}
                                  >
                                    {tag}
                                  </span>
                                );
                              })}
                            {sample.detected_blocks.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{sample.detected_blocks.length - 4}
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(sample.updated_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenaming(sample);
                            }}
                            title="Rename"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(sample);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
      </MatrxDynamicPanelHost>

      <TextInputDialog
        open={!!renaming}
        onOpenChange={(o) => {
          if (!o && !busy) setRenaming(null);
        }}
        title="Rename sample"
        placeholder="New name"
        defaultValue={renaming?.name ?? ""}
        confirmLabel="Rename"
        busy={busy}
        onConfirm={handleRename}
      />
    </>
  );
}
