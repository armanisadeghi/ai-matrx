"use client";

/**
 * ScannerDesktop — the desktop skin of the scanner (design: "Photo-to-PDF
 * Desktop", Claude Design 2026-07). Sidebar + workspace shell:
 *
 *   ┌─────────┬──────────────────────────────────────┐
 *   │ rail    │  HOME  (hero · dropzone · webcam /   │
 *   │ New scan│         import cards · recent scans) │
 *   │ recent  │  REVIEW (title · grid⇄list · save)   │
 *   │ trust   │  PROCESSING (shared ProcessingView)  │
 *   └─────────┴──────────────────────────────────────┘
 *
 * All logic is the shared engine (useScanSession + useScanSaveFlow); the
 * camera, crop editor, processing page and context prompt are the same
 * components the mobile surface uses. Results live on the extractor
 * (`/tools/pdf-extractor/{doc_id}`) — the design's Preview/Text/Ask tabs
 * map onto the extractor's panes + agent panel (one canonical surface).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera as CameraIcon,
  Check,
  FilePlus2,
  FileText,
  History,
  Home,
  Image as ImageIcon,
  Loader2,
  Plus,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { UploadContextPrompt } from "@/features/scopes/components/context-assignment/UploadContextPrompt";

import { fetchRecentScans, type RecentScanRow } from "../../processing";
import type { Quad, ScanItem, ScanRotation } from "../../types";
import { useScanSession } from "../../useScanSession";
import { defaultScanLabel, useScanSaveFlow } from "../../useScanSaveFlow";
import { CaptureView } from "../CaptureView";
import { CropSheet } from "../CropSheet";
import { ProcessingView } from "../ProcessingView";
import { DesktopReview } from "./DesktopReview";

type DesktopView = "home" | "review";

export default function ScannerDesktop() {
  const router = useRouter();
  const session = useScanSession();
  const flow = useScanSaveFlow(session);

  const [view, setView] = useState<DesktopView>("home");
  const [capturing, setCapturing] = useState(false);
  const [cropItem, setCropItem] = useState<ScanItem | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [recent, setRecent] = useState<RecentScanRow[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // First add flips Home → Review (the design's flow); later adds keep
  // whatever view the user is in.
  const hadItemsRef = useRef(false);
  useEffect(() => {
    if (session.items.length > 0 && !hadItemsRef.current) setView("review");
    hadItemsRef.current = session.items.length > 0;
  }, [session.items.length]);

  useEffect(() => {
    let cancelled = false;
    fetchRecentScans(9)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const imageShots = session.items
    .filter((i) => i.kind === "image" && i.previewUrl)
    .map((i) => ({ itemId: i.itemId, previewUrl: i.previewUrl as string }));

  const handleFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type === "application/pdf" ||
          /\.(heic|heif|pdf)$/i.test(f.name),
      );
      if (accepted.length > 0) session.addFiles(accepted);
    },
    [session],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(e.target.files ?? []));
      e.target.value = "";
    },
    [handleFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(Array.from(e.dataTransfer?.files ?? []));
    },
    [handleFiles],
  );

  const handleCropApply = useCallback(
    (itemId: string, quad: Quad | null, rotation: ScanRotation) => {
      session.setQuad(itemId, quad);
      session.setRotation(itemId, rotation);
    },
    [session],
  );

  const handleSave = useCallback(() => {
    if (!session.label.trim()) session.setLabel(defaultScanLabel());
    flow.saveNow();
  }, [session, flow]);

  const openDoc = useCallback(
    (docId: string) => router.push(`/tools/pdf-extractor/${docId}`),
    [router],
  );

  const itemCount = session.items.length;

  return (
    <div className="flex h-full min-h-0 bg-muted/30">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card px-4 pb-4 pt-5">
        <div className="mb-5 flex items-center gap-2.5 px-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <ScanLine className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Scanner</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Document workspace
            </p>
          </div>
        </div>

        <Button
          className="mb-1.5 h-11 w-full shadow-md shadow-primary/20"
          onClick={() => {
            setView("home");
            setCapturing(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New scan
        </Button>
        <button
          type="button"
          onClick={() => setView("home")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            view === "home"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Home className="h-4 w-4" />
          Home
        </button>
        {itemCount > 0 && (
          <button
            type="button"
            onClick={() => setView("review")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              view === "review"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <ImageIcon className="h-4 w-4" />
            Current scan
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
              {itemCount}
            </span>
          </button>
        )}

        <p className="mb-2 mt-5 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Recent scans
        </p>
        <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
          {recent === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
            </div>
          ) : recent.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground/70">
              Scans you save land here.
            </p>
          ) : (
            recent.map((r) => (
              <button
                key={r.docId}
                type="button"
                onClick={() => openDoc(r.docId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent/60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                  <FileText className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">
                    {r.name}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {r.itemCount ? ` · ${r.itemCount} items` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-3 flex items-start gap-2.5 border-t border-border px-2 pt-3 text-xs leading-snug text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Every page saves instantly — nothing is lost.
        </div>
      </aside>

      {/* ── Workspace ───────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "home" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-11 pb-11 pt-8">
            {/* Resume banner */}
            {session.resumable && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                  Unsaved scan with {session.resumable.items.length} item
                  {session.resumable.items.length === 1 ? "" : "s"}
                  {session.resumable.label
                    ? ` — “${session.resumable.label}”`
                    : ""}
                </p>
                <Button size="sm" onClick={session.resume}>
                  Resume
                </Button>
                <Button size="sm" variant="ghost" onClick={session.dismissResume}>
                  Later
                </Button>
              </div>
            )}

            <div className="mb-2.5 flex items-center gap-2">
              <div className="h-2 w-2 rounded-sm bg-primary" />
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Scanner
              </p>
            </div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight">
              Scan to PDF
            </h1>
            <p className="mb-7 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              Drop your files or capture pages from your camera. We combine
              them into a single PDF, extract the text, and index it for
              retrieval.
            </p>

            {/* Dropzone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <p className="mb-1 text-xl font-bold">
                {dragOver ? "Drop to add" : "Drag & drop files here"}
              </p>
              <p className="text-sm text-muted-foreground">
                or{" "}
                <span className="font-semibold text-primary">
                  browse your computer
                </span>{" "}
                — drop multiple files at once
              </p>
              <p className="mt-2.5 font-mono text-[11px] text-muted-foreground/80">
                PDF · JPG · PNG · HEIC
              </p>
            </div>

            {/* Action cards */}
            <div className="mb-9 mt-4 flex gap-3.5">
              <button
                type="button"
                onClick={() => setCapturing(true)}
                className="flex flex-1 items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <CameraIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    Capture from webcam
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Rapid capture — auto crop each page
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold">Import a document</p>
                  <p className="text-xs text-muted-foreground">
                    Add an existing PDF or image
                  </p>
                </div>
              </button>
            </div>

            {/* Recent scans */}
            {recent && recent.length > 0 && (
              <>
                <div className="mb-3.5 flex items-baseline justify-between">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Recent scans
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {recent.slice(0, 6).map((r) => (
                    <button
                      key={r.docId}
                      type="button"
                      onClick={() => openDoc(r.docId)}
                      className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-colors hover:border-primary/40"
                    >
                      <div className="relative flex h-24 items-center justify-center border-b border-border bg-muted/40">
                        <div className="flex h-16 w-12 flex-col gap-1 rounded-sm border border-border bg-background p-2 shadow-md">
                          <div className="h-1 w-3/5 rounded-full bg-muted-foreground/40" />
                          <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
                          <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/20" />
                          <div className="h-0.5 w-11/12 rounded-full bg-muted-foreground/20" />
                          <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/20" />
                        </div>
                        {r.cleanReady && (
                          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Check className="h-2.5 w-2.5" />
                            Indexed
                          </span>
                        )}
                      </div>
                      <div className="px-3.5 py-3">
                        <p className="truncate text-sm font-semibold">
                          {r.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {r.itemCount ? ` · ${r.itemCount} items` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <DesktopReview
            session={session}
            saving={Boolean(flow.processing) || flow.navigating}
            onHome={() => setView("home")}
            onAddPages={() => setCapturing(true)}
            onImport={() => fileInputRef.current?.click()}
            onCrop={setCropItem}
            onDiscard={() => setConfirmDiscard(true)}
            onSave={handleSave}
          />
        )}
      </main>

      {/* Hidden picker (images + PDFs) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif,.pdf"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Overlays — shared with mobile */}
      {capturing && (
        <CaptureView
          onCapture={session.addCapture}
          shots={imageShots}
          onRemoveShot={session.removeItem}
          uploadingCount={session.uploadingCount}
          onDone={() => setCapturing(false)}
        />
      )}

      <CropSheet
        item={cropItem}
        onClose={() => setCropItem(null)}
        onApply={handleCropApply}
      />

      {flow.processing && (
        <ProcessingView
          label={flow.savedLabel || "Scanned document"}
          state={flow.processing}
          onAssignContext={flow.openAssignContext}
        />
      )}

      <UploadContextPrompt
        open={flow.contextPromptOpen}
        onOpenChange={flow.onContextPromptChange}
        fileNames={[flow.savedLabel || "Scanned document"]}
        awaitFileIds={flow.awaitFileIds}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this scan?"
        description="All photos and files added to this scan session will be deleted."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={async () => {
          await session.discard();
          setConfirmDiscard(false);
          setView("home");
        }}
      />
    </div>
  );
}
