"use client";

/**
 * ScannerSurface — the MOBILE phone-scanner surface of the PDF domain.
 * (Desktop renders `desktop/ScannerDesktop` — same engine, different skin.)
 *
 * Flow: add items (camera / library / files — every add uploads
 * IMMEDIATELY via useScanSession) → review grid (reorder / crop /
 * remove) → save via the shared useScanSaveFlow engine: ONE streaming
 * round trip builds the PDF server-side (crops applied there), extracts
 * it, and hands back `doc_id`; the context-assignment prompt (canonical
 * UploadContextPrompt) runs in parallel; we land on
 * `/tools/pdf-extractor/{doc_id}`.
 */

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera as CameraIcon,
  FilePlus2,
  History,
  ImagePlus,
  Loader2,
  ScanLine,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderBack from "@/features/shell/components/header/variants/shared/HeaderBack";
import { UploadContextPrompt } from "@/features/scopes/components/context-assignment/UploadContextPrompt";

import type { Quad, ScanItem, ScanRotation } from "../types";
import { useScanSession } from "../useScanSession";
import { defaultScanLabel, useScanSaveFlow } from "../useScanSaveFlow";
import { CaptureView } from "./CaptureView";
import { CropSheet, type CropEnhance } from "./CropSheet";
import { ProcessingView } from "./ProcessingView";
import { ReviewList } from "./ReviewList";
import { SaveSheet } from "./SaveSheet";

export default function ScannerSurface() {
  const router = useRouter();
  const session = useScanSession();
  const flow = useScanSaveFlow(session);

  const [capturing, setCapturing] = useState(false);
  const [cropItem, setCropItem] = useState<ScanItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageShots = session.items
    .filter((i) => i.kind === "image" && i.previewUrl)
    .map((i) => ({ itemId: i.itemId, previewUrl: i.previewUrl as string }));

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) session.addFiles(files);
      e.target.value = "";
    },
    [session],
  );

  const handleCropApply = useCallback(
    (
      itemId: string,
      quad: Quad | null,
      rotation: ScanRotation,
      enhance: CropEnhance,
    ) => {
      session.setQuad(itemId, quad);
      session.setRotation(itemId, rotation);
      session.setEnhance(itemId, enhance.mode, enhance.fileId);
    },
    [session],
  );

  const openSave = useCallback(() => {
    if (!session.label.trim()) session.setLabel(defaultScanLabel());
    setSaveOpen(true);
  }, [session]);

  const handleSave = useCallback(() => {
    setSaveOpen(false);
    flow.saveNow();
  }, [flow]);

  const empty = session.items.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Route chrome — portals into the shell header row */}
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 pr-12">
          <HeaderBack onClick={() => router.back()} />
          <ScanLine className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-semibold">Scan to PDF</h1>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {session.uploadingCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                saving {session.uploadingCount}
              </span>
            )}
            {!empty && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setConfirmDiscard(true)}
                aria-label="Discard scan"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Resume banner */}
      {session.resumable && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Unsaved scan with {session.resumable.items.length} item
            {session.resumable.items.length === 1 ? "" : "s"}
            {session.resumable.label ? ` — “${session.resumable.label}”` : ""}
          </p>
          <Button size="sm" className="h-8" onClick={session.resume}>
            Resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={session.dismissResume}
          >
            Later
          </Button>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ScanLine className="h-8 w-8 text-primary/70" />
            </div>
            <div>
              <p className="text-sm font-medium">Use your phone as a scanner</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Take photos, add existing images or PDFs, crop, reorder — then
                save everything as one searchable PDF.
              </p>
            </div>
          </div>
        ) : (
          <ReviewList
            items={session.items}
            onMove={session.moveItem}
            onCrop={setCropItem}
            onRemove={session.removeItem}
            onRetry={session.retryItem}
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border px-3 pb-safe pt-2">
        {session.errorCount > 0 && (
          <p className="pb-1 text-center text-[11px] text-destructive">
            {session.errorCount} upload{session.errorCount === 1 ? "" : "s"}{" "}
            failed — tap a failed tile to retry, or remove it.
          </p>
        )}
        <div className="flex items-center gap-2 pb-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => setCapturing(true)}
          >
            <CameraIcon className="mr-1.5 h-4 w-4" />
            Camera
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => libraryInputRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-4 w-4" />
            Photos
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Files
          </Button>
        </div>
        <Button
          className="mb-2 h-11 w-full"
          disabled={
            !session.allUploaded || Boolean(flow.processing) || flow.navigating
          }
          onClick={openSave}
        >
          {flow.navigating ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Opening extractor…
            </>
          ) : session.uploadingCount > 0 ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Waiting for uploads…
            </>
          ) : (
            <>
              Save {session.items.length > 0 ? `(${session.items.length})` : ""}
            </>
          )}
        </Button>
      </div>

      {/* Hidden pickers */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif,.pdf"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Overlays */}
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

      <SaveSheet
        open={saveOpen}
        onOpenChange={setSaveOpen}
        label={session.label}
        onLabelChange={session.setLabel}
        itemCount={session.items.length}
        onSave={handleSave}
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
        }}
      />
    </div>
  );
}
