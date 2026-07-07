"use client";

/**
 * PdfManipulationWorkbench — canonical split-pane surface for PDF manipulation.
 *
 * Top: pick any cloud PDF (PdfSourcePicker).
 * Left: PdfManipulationViewer (same PDF pane + CropOverlay as PdfStudioReader).
 * Right: ManipulationPanel (same inspector panel as PdfStudioInspector).
 *
 * Mounted by `/demos/pdf-processing/manipulation` and intended as the single
 * place to debug crop/reorder and every other matrx-utils PDF op without the
 * full extractor studio chrome (sidebar, text panes, pipeline toolbar).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectFileById } from "@/features/files/redux/selectors";
import { useCloudTree } from "@/features/files";
import { filesDb } from "@/features/files/filesDb";
import { supabase } from "@/utils/supabase/client";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import {
  EMPTY_PDF_SOURCE,
  PdfSourcePicker,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { ManipulationPanel } from "../components/ManipulationPanel";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import { PdfManipulationViewer, type PdfPaneEditMode } from "./PdfStudioReader";

function provisionalDocFromFile(params: {
  fileId: string;
  fileName: string;
  processedDocumentId: string | null;
}): PdfDocument {
  const now = new Date().toISOString();
  return {
    id: params.processedDocumentId ?? params.fileId,
    name: params.fileName,
    content: null,
    cleanContent: null,
    createdAt: now,
    updatedAt: now,
    charCount: 0,
    wordCount: 0,
    ownerId: null,
    organizationId: null,
    totalPages: null,
    mimeType: "application/pdf",
    sourceKind: "cld_file",
    sourceId: params.fileId,
    parentProcessedId: null,
    derivationKind: "initial_extract",
    derivationMetadata: null,
    structuredJson: null,
    isHydrated: false,
  };
}

export function PdfManipulationWorkbench({
  className,
}: {
  className?: string;
}) {
  const userId = useAppSelector(selectUserId);
  useCloudTree(userId);

  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [missingProcessedDoc, setMissingProcessedDoc] = useState(false);

  const [activePage, setActivePage] = useState<number | null>(1);
  const [pdfPaneEditMode, setPdfPaneEditMode] = useState<PdfPaneEditMode>(null);
  const [cropPagesInput, setCropPagesInput] = useState("");

  const fileId = source.payload?.media?.file_id ?? null;
  const cachedFile = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : undefined,
  );

  useEffect(() => {
    if (!fileId) {
      setDoc(null);
      setResolveError(null);
      setMissingProcessedDoc(false);
      setPdfPaneEditMode(null);
      setCropPagesInput("");
      setActivePage(1);
      return undefined;
    }

    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    void (async () => {
      try {
        const { processedDocumentId } = await resolvePdfSurfaceIds({ fileId });

        let fileName = cachedFile?.fileName ?? null;
        if (!fileName) {
          const { data, error } = await filesDb(supabase)
            .from("files")
            .select("file_name")
            .eq("id", fileId)
            .maybeSingle();
          if (error) throw error;
          fileName = data?.file_name ?? `PDF ${fileId.slice(0, 8)}`;
        }

        if (cancelled) return;

        setMissingProcessedDoc(!processedDocumentId);
        setDoc(
          provisionalDocFromFile({
            fileId,
            fileName,
            processedDocumentId,
          }),
        );
        setActivePage(1);
        setPdfPaneEditMode(null);
        setCropPagesInput("");
      } catch (err) {
        if (!cancelled) {
          setDoc(null);
          setResolveError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, cachedFile?.fileName]);

  const handleStartCrop = useCallback((pagesInput: string) => {
    setCropPagesInput(pagesInput);
    setPdfPaneEditMode("crop");
  }, []);

  const handleStartReorder = useCallback(() => {
    setPdfPaneEditMode("reorder");
  }, []);

  const handleEditModeCancel = useCallback(() => {
    setPdfPaneEditMode(null);
    setCropPagesInput("");
  }, []);

  const resetSource = useCallback(() => {
    setSource(EMPTY_PDF_SOURCE);
  }, []);

  const sourceIsUrlOnly =
    !!source.payload?.url && !source.payload?.media?.file_id;

  return (
    <div
      className={cn(
        "flex h-[calc(100dvh-var(--header-height))] w-full flex-col overflow-hidden bg-textured",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-base font-semibold text-foreground">
                PDF manipulation workbench
              </h1>
              <p className="text-xs text-muted-foreground">
                Same viewer + ManipulationPanel as PDF Extractor — pick a cloud
                PDF, then use the right rail (crop draws on the left pane).
              </p>
            </div>
            {source.payload ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetSource}
                className="h-7 gap-1.5 text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                Change file
              </Button>
            ) : null}
          </div>
          {!source.payload ? (
            <PdfSourcePicker value={source} onChange={setSource} />
          ) : (
            <div className="truncate text-xs text-muted-foreground">
              {source.label}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
        {sourceIsUrlOnly ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              URL sources are not supported in this workbench. Pick or upload a
              cloud PDF so the viewer and manipulation panel share the same{" "}
              <code className="rounded bg-muted px-1">file_id</code> wire as PDF
              Extractor.
            </p>
          </div>
        ) : !fileId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Choose a PDF above to load the workbench.
            </p>
          </div>
        ) : resolving ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading file…
          </div>
        ) : resolveError ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex max-w-md items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{resolveError}</span>
            </div>
          </div>
        ) : doc ? (
          <>
            {missingProcessedDoc ? (
              <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
                No processed document is linked to this file — crop/download
                still work, but &quot;Save as document&quot; needs an extraction
                row (run PDF Extractor once on this file).
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_28rem]">
              <main className="min-h-0 overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
                <PdfManipulationViewer
                  doc={doc}
                  activePage={activePage}
                  onActivePage={setActivePage}
                  editMode={pdfPaneEditMode}
                  cropPagesInput={cropPagesInput}
                  onEditModeCancel={handleEditModeCancel}
                />
              </main>
              <aside className="min-h-0 overflow-hidden bg-card/30">
                <ManipulationPanel
                  doc={doc}
                  pdfPaneEditMode={pdfPaneEditMode}
                  onStartCrop={handleStartCrop}
                  onStartReorder={handleStartReorder}
                  onEditModeCancel={handleEditModeCancel}
                />
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default PdfManipulationWorkbench;
