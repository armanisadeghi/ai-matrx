"use client";

/**
 * ItemDetailView — VIEW mode for one capture item
 * (`/tools/product-capture/item/[id]`).
 *
 * Manage the item's media (delete existing files, add new photos/videos from
 * the device) and its identity (SKU + notes, same guarded autosave as the
 * capture surface — no save button anywhere). "Capture" continues the
 * picture-taking flow on this exact item (`/tools/product-capture?item=`).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  FileAudio,
  ImagePlus,
  Loader2,
  Play,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { toast } from "@/lib/toast";

import type { CaptureFile, CaptureItem } from "../types";
import {
  closeItem,
  listItemFiles,
  loadItem,
  setItemCode,
  setItemNotes,
} from "../service";
import { removeItemFile, uploadItemFile } from "../uploads";
import { ProductCaptureHeader } from "./ProductCaptureHeader";

const NOTES_AUTOSAVE_MS = 800;

interface PendingUpload {
  localId: string;
  fileName: string;
  status: "uploading" | "error";
}

export function ItemDetailView({ itemId }: { itemId: string }) {
  const router = useRouter();

  const [item, setItem] = useState<CaptureItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [files, setFiles] = useState<CaptureFile[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [previewFile, setPreviewFile] = useState<CaptureFile | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] =
    useState<CaptureFile | null>(null);

  const itemRef = useRef<CaptureItem | null>(null);
  const notesRef = useRef("");
  const notesDirtyRef = useRef(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const adoptItem = useCallback((next: CaptureItem) => {
    itemRef.current = next;
    setItem(next);
  }, []);

  // Initial load, deferred a tick (no sync setState in the effect).
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const loaded = await loadItem(itemId);
          if (!loaded) {
            setNotFound(true);
            return;
          }
          adoptItem(loaded);
          notesRef.current = loaded.notes;
          setNotes(loaded.notes);
          setFiles(await listItemFiles(itemId));
        } catch (err) {
          console.error("[product-capture] item load failed", err);
          toast.error("Could not load the item.");
          setNotFound(true);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [itemId, adoptItem]);

  // ── Notes autosave (same contract as the capture surface) ────────────────
  const flushNotes = useCallback(async () => {
    const current = itemRef.current;
    if (!current || !notesDirtyRef.current) return;
    notesDirtyRef.current = false;
    setNotesSaving(true);
    try {
      adoptItem(await setItemNotes(current, notesRef.current));
    } catch (err) {
      notesDirtyRef.current = true;
      console.error("[product-capture] notes autosave failed", err);
      toast.error("Notes could not be saved — check your connection.");
    } finally {
      setNotesSaving(false);
    }
  }, [adoptItem]);

  const onNotesChange = useCallback(
    (text: string) => {
      notesRef.current = text;
      notesDirtyRef.current = true;
      setNotes(text);
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
      notesTimerRef.current = setTimeout(() => void flushNotes(), NOTES_AUTOSAVE_MS);
    },
    [flushNotes],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushNotes();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      // Flush any notes still inside the debounce window — the Capture
      // action navigates away and an SPA route change fires no
      // visibilitychange, so without this the last keystrokes would be lost.
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
      void flushNotes();
    };
  }, [flushNotes]);

  const markReady = useCallback(async () => {
    const current = itemRef.current;
    if (!current) return;
    setStatusBusy(true);
    try {
      const wasProcessed = current.status === "processed";
      // Flipping into `captured` IS the workflow handoff (the DB transition
      // fires the event trigger) — one write covers "mark ready" and
      // "reprocess" alike.
      adoptItem(await closeItem(current));
      toast.success(
        wasProcessed ? "Queued for reprocessing." : "Marked ready for processing.",
      );
    } catch (err) {
      console.error("[product-capture] status change failed", err);
      toast.error("Could not update the item's status.");
    } finally {
      setStatusBusy(false);
    }
  }, [adoptItem]);

  const commitCode = useCallback(
    async (code: string) => {
      const current = itemRef.current;
      if (!current) return;
      if (code.trim() === (current.code ?? "")) return;
      try {
        adoptItem(await setItemCode(current, code, "manual"));
      } catch (err) {
        console.error("[product-capture] code save failed", err);
        toast.error("Could not save the product number.");
      }
    },
    [adoptItem],
  );

  // ── Media management ─────────────────────────────────────────────────────
  const onAddFiles = useCallback(
    (picked: File[]) => {
      const current = itemRef.current;
      if (!current || picked.length === 0) return;
      for (const file of picked) {
        const localId = crypto.randomUUID();
        const kind = file.type.startsWith("video/") ? "video" : "photo";
        setPending((prev) => [
          ...prev,
          { localId, fileName: file.name, status: "uploading" },
        ]);
        void uploadItemFile({ item: current, file, kind })
          .then(({ link }) => {
            setPending((prev) => prev.filter((p) => p.localId !== localId));
            setFiles((prev) => [...prev, link]);
          })
          .catch((err: unknown) => {
            console.error("[product-capture] add-file upload failed", err);
            setPending((prev) =>
              prev.map((p) =>
                p.localId === localId ? { ...p, status: "error" } : p,
              ),
            );
          });
      }
    },
    [],
  );

  const deleteFile = useCallback(async (file: CaptureFile) => {
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    try {
      await removeItemFile({
        itemId: file.itemId,
        fileId: file.fileId,
        linkId: file.id,
      });
    } catch (err) {
      console.error("[product-capture] file delete failed", err);
      toast.error("Could not delete the file.");
      setFiles((prev) => [...prev, file]);
    }
  }, []);

  const media = files.filter((f) => f.kind !== "audio");
  const audioNotes = files.filter((f) => f.kind === "audio");
  const title = item?.code ?? "Capture item";

  if (notFound) {
    return (
      <>
        <PageHeader>
          <ProductCaptureHeader
            backHref="/tools/product-capture/all"
            title="Product Capture"
          />
        </PageHeader>
        <div className="flex h-full items-center justify-center pt-[var(--shell-header-h)]">
          <p className="text-sm text-muted-foreground">
            This item no longer exists.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader>
        <ProductCaptureHeader
          backHref="/tools/product-capture/all"
          title={title}
          right={
            <TapTargetButtonSolid
              icon={<Camera className="h-4 w-4" />}
              label="Capture"
              ariaLabel="Continue capturing this item"
              onClick={() =>
                router.push(`/tools/product-capture?item=${itemId}`)
              }
            />
          }
        />
      </PageHeader>

      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        {item === null ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-safe pt-4">
            {/* Identity */}
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex-1 basis-56">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Product # / SKU
                  </span>
                  <CodeField
                    key={item.code ?? ""}
                    initialCode={item.code ?? ""}
                    onCommit={(code) => void commitCode(code)}
                  />
                </label>
                <div className="text-xs text-muted-foreground">
                  <p>
                    Captured{" "}
                    {new Date(item.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="mt-0.5 capitalize">
                    {item.status === "captured"
                      ? "Ready for processing"
                      : item.status}
                  </p>
                  {(item.status === "capturing" ||
                    item.status === "processed") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1.5 h-7 px-2 text-xs"
                      disabled={statusBusy}
                      onClick={() => void markReady()}
                    >
                      {statusBusy ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      {item.status === "processed"
                        ? "Reprocess"
                        : "Mark ready for processing"}
                    </Button>
                  )}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  Notes
                  <span className="font-normal">
                    {notesSaving ? "Saving…" : "Saved automatically"}
                  </span>
                </span>
                <Textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Type or paste notes for this item…"
                  className="min-h-24 text-base"
                />
              </label>
            </section>

            {/* Media */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Photos &amp; videos
                  <span className="ml-2 font-normal text-muted-foreground">
                    {media.length}
                  </span>
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => addInputRef.current?.click()}
                >
                  <ImagePlus className="mr-1.5 h-4 w-4" />
                  Add photos
                </Button>
              </div>

              {media.length === 0 && pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No photos yet — add some from your device or continue
                  capturing.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {media.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      aria-label="View file"
                      className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                    >
                      <CaptureThumb
                        fileId={file.fileId}
                        alt={item.code ?? "Captured file"}
                      />
                      {file.kind === "video" && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-6 w-6 text-white drop-shadow" />
                        </span>
                      )}
                    </button>
                  ))}
                  {pending.map((p) => (
                    <div
                      key={p.localId}
                      className={
                        "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center " +
                        (p.status === "error"
                          ? "border-destructive text-destructive"
                          : "border-border text-muted-foreground")
                      }
                    >
                      {p.status === "uploading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      <span className="line-clamp-2 break-all text-[10px]">
                        {p.status === "error" ? "Upload failed" : p.fileName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Voice notes */}
            {audioNotes.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">
                  Voice notes
                  <span className="ml-2 font-normal text-muted-foreground">
                    {audioNotes.length}
                  </span>
                </h2>
                <ul className="space-y-1.5">
                  {audioNotes.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        Voice note ·{" "}
                        {new Date(file.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Delete voice note"
                        onClick={() => setConfirmDeleteFile(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Transcripts of voice notes are appended to the item notes
                  above.
                </p>
              </section>
            )}
          </div>
        )}
      </div>

      <input
        ref={addInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          onAddFiles(picked);
        }}
      />

      {/* Full-screen file preview */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              <CaptureThumb
                fileId={previewFile.fileId}
                alt={item?.code ?? "Captured file"}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 bg-black px-4 py-3 pb-safe">
            <Button
              variant="destructive"
              className="h-11 px-5"
              onClick={() => {
                setConfirmDeleteFile(previewFile);
                setPreviewFile(null);
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button
              variant="secondary"
              className="h-11 px-5"
              onClick={() => setPreviewFile(null)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteFile !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteFile(null);
        }}
        title="Delete this file?"
        description="The file is removed from the item and deleted from storage."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteFile) void deleteFile(confirmDeleteFile);
          setConfirmDeleteFile(null);
        }}
      />
    </>
  );
}

function CodeField({
  initialCode,
  onCommit,
}: {
  initialCode: string;
  onCommit: (code: string) => void;
}) {
  const [draft, setDraft] = useState(initialCode);
  const commit = () => {
    if (draft.trim() !== initialCode) onCommit(draft.trim());
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="Not set"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
