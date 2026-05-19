// components/admin/markdown-tester/SampleManager.tsx
// Popover-driven CRUD for saved Markdown Tester samples. Replaces the
// IDB-backed SnippetManager — these samples live in Supabase.
//
// Actions per row: Load (replace textarea), Edit metadata (name /
// description / tags), Delete. The Save Current / Update / Save As New
// actions at the top operate on the parent's `currentContent`.

"use client";

import React, { useMemo, useState } from "react";
import {
  Archive,
  Clock,
  Edit2,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
  SaveAll,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import { useMarkdownSamples } from "./useMarkdownSamples";
import { detectRenderBlocks } from "./utils/detect-render-blocks";
import { SampleEditor } from "./SampleEditor";
import type { MarkdownSample } from "./samples-service";

interface SampleManagerProps {
  /** The current textarea content. Used as the source-of-truth for saves. */
  currentContent: string;
  /** id of the currently-loaded sample, or null if the buffer is unsaved. */
  loadedSampleId: string | null;
  /** Called when the user loads a sample — replaces the textarea content. */
  onLoad: (sample: MarkdownSample) => void;
  /** Called when the user restores the IDB autosave buffer. */
  onLoadAutosave: () => void;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function truncatePreview(content: string, maxLen = 80): string {
  const oneLine = content.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + "…";
}

type EditorState =
  | { mode: "closed" }
  | {
      mode: "create" | "edit" | "save-as";
      sample?: MarkdownSample;
      sessionKey: string;
    };

function makeSessionKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SampleManager({
  currentContent,
  loadedSampleId,
  onLoad,
  onLoadAutosave,
}: SampleManagerProps) {
  const { samples, isLoading, error, create, update, remove } =
    useMarkdownSamples();
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const loadedSample = useMemo(
    () => (loadedSampleId ? samples.find((s) => s.id === loadedSampleId) : undefined),
    [loadedSampleId, samples],
  );

  const hasContent = !!currentContent.trim();

  const openCreate = () => {
    setEditor({ mode: "create", sessionKey: makeSessionKey() });
  };

  const openSaveAs = () => {
    setEditor({
      mode: "save-as",
      sample: loadedSample,
      sessionKey: makeSessionKey(),
    });
  };

  const openEdit = (sample: MarkdownSample) => {
    setEditor({ mode: "edit", sample, sessionKey: makeSessionKey() });
  };

  const closeEditor = () => setEditor({ mode: "closed" });

  const handleQuickUpdate = async () => {
    if (!loadedSample) return;
    setBusyId(loadedSample.id);
    try {
      await update(loadedSample.id, {
        content: currentContent,
        detected_blocks: detectRenderBlocks(currentContent),
      });
      toast.success(`Updated "${loadedSample.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update sample",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleLoad = (sample: MarkdownSample) => {
    onLoad(sample);
    setOpen(false);
  };

  const handleDelete = async (sample: MarkdownSample) => {
    const ok = await confirm({
      title: "Delete sample?",
      description: `This will permanently delete "${sample.name}". This action cannot be undone.`,
      variant: "destructive",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(sample.id);
    try {
      await remove(sample.id);
      toast.success(`Deleted "${sample.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete sample",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleEditorConfirm = async (values: {
    name: string;
    description: string;
    detectedBlocks: string[];
  }) => {
    if (editor.mode === "closed") return;
    try {
      if (editor.mode === "create" || editor.mode === "save-as") {
        setSavingNew(true);
        const created = await create({
          name: values.name,
          description: values.description,
          content: currentContent,
          detected_blocks: values.detectedBlocks,
        });
        toast.success(`Saved "${created.name}"`);
        closeEditor();
        onLoad(created);
        setOpen(false);
      } else if (editor.mode === "edit" && editor.sample) {
        setBusyId(editor.sample.id);
        await update(editor.sample.id, {
          name: values.name,
          description: values.description,
          detected_blocks: values.detectedBlocks,
        });
        toast.success(`Updated "${values.name}"`);
        closeEditor();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save sample",
      );
    } finally {
      setSavingNew(false);
      setBusyId(null);
    }
  };

  const editorInitial = (() => {
    if (editor.mode === "closed") {
      return {
        name: "",
        description: "",
        detectedBlocks: [],
        content: currentContent,
      };
    }
    if (editor.mode === "edit" && editor.sample) {
      return {
        name: editor.sample.name,
        description: editor.sample.description,
        detectedBlocks: editor.sample.detected_blocks ?? [],
        content: editor.sample.content,
      };
    }
    if (editor.mode === "save-as" && editor.sample) {
      return {
        name: `${editor.sample.name} (copy)`,
        description: editor.sample.description,
        detectedBlocks: editor.sample.detected_blocks ?? [],
        content: currentContent,
      };
    }
    return {
      name: "",
      description: "",
      detectedBlocks: [],
      content: currentContent,
    };
  })();

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            Samples
            {samples.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 px-1 text-[10px]"
              >
                {samples.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-3 pb-2 border-b border-border">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-medium">Markdown samples</h4>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                Supabase · super-admin
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Test fixtures shared across the team. Stored in
              {" "}<code className="text-[10px]">admin_markdown_samples</code>.
            </p>
          </div>

          <div className="p-2 border-b border-border flex flex-wrap gap-1.5">
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs flex-1 min-w-0"
              onClick={openCreate}
              disabled={!hasContent || savingNew}
            >
              {savingNew ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3 w-3 mr-1.5" />
              )}
              Save new
            </Button>
            {loadedSample && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleQuickUpdate}
                  disabled={!hasContent || busyId === loadedSample.id}
                  title={`Update "${loadedSample.name}" with current content`}
                >
                  {busyId === loadedSample.id ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <SaveAll className="h-3 w-3 mr-1.5" />
                  )}
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={openSaveAs}
                  disabled={!hasContent}
                >
                  Save as
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onLoadAutosave();
                setOpen(false);
              }}
              title="Restore the last autosaved buffer"
            >
              <RotateCcw className="h-3 w-3 mr-1.5" />
              Autosave
            </Button>
          </div>

          {error && (
            <div className="px-3 py-2 text-[11px] text-destructive border-b border-destructive/20 bg-destructive/5">
              {error}
            </div>
          )}

          <ScrollArea className="max-h-80">
            {isLoading ? (
              <div className="p-4 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading samples…
              </div>
            ) : samples.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No saved samples yet. Save your current content to seed the
                library.
              </div>
            ) : (
              <div className="p-1">
                {samples.map((sample) => {
                  const isLoaded = sample.id === loadedSampleId;
                  const isBusy = busyId === sample.id;
                  return (
                    <div
                      key={sample.id}
                      className={`group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer ${
                        isLoaded
                          ? "bg-accent/50"
                          : "hover:bg-accent"
                      }`}
                      onClick={() => handleLoad(sample)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {sample.name}
                          </span>
                          {isLoaded && (
                            <Badge
                              variant="default"
                              className="text-[10px] h-4 px-1.5"
                            >
                              loaded
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5 ml-auto">
                            <Clock className="h-2.5 w-2.5" />
                            {formatRelativeTime(sample.updated_at)}
                          </span>
                        </div>
                        {sample.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {sample.description}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground line-clamp-1 font-mono">
                          {truncatePreview(sample.content)}
                        </p>
                        {sample.detected_blocks &&
                          sample.detected_blocks.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sample.detected_blocks.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] h-4 px-1.5"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                      </div>
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(sample);
                          }}
                          title="Edit name / description / tags"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(sample);
                          }}
                          title="Delete sample"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <SampleEditor
        open={editor.mode !== "closed"}
        onOpenChange={(o) => {
          if (!o) closeEditor();
        }}
        mode={editor.mode === "edit" ? "edit" : "create"}
        initial={editorInitial}
        sessionKey={editor.mode === "closed" ? undefined : editor.sessionKey}
        busy={
          savingNew || (editor.mode === "edit" && busyId === editor.sample?.id)
        }
        onConfirm={handleEditorConfirm}
      />
    </>
  );
}
