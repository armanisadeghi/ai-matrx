"use client";

/**
 * PdfStudioHeaderControls — the studio's shell `<PageHeader>` content.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ [☐ sidebar] ←  doc name ···        ‹ 3 / 142 ›          ••• [☐ insp]│
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Renders full-width in the shell header band (not inside a column), so the
 * sidebar/inspector no longer compete for header space. The sidebar/inspector
 * collapse toggles live here — the panels themselves just watch the boolean.
 * Document identity (rename, delete, PDF-surface switcher, cloud-file menu)
 * is the existing `PdfStudioDocTitle`; this component adds only the studio
 * action soup (pipeline / AI clean / knowledge assets / copy pages / find /
 * refresh / download / share / open source) behind a single overflow menu
 * plus the page jumper.
 */

import React, { useCallback, useState } from "react";
import {
  ClipboardList,
  Download,
  ExternalLink,
  Loader2,
  PartyPopper,
  RefreshCw,
  Search,
  Share2,
  WandSparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
  MoreHorizontalTapButton,
  PanelLeftTapButton,
  PanelRightTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { downloadFile } from "@/features/files";
import { useOpenShareModalWindow } from "@/features/overlays/openers/shareModalWindow";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { PdfStudioDocTitle } from "./PdfStudioDocTitle";
import type { PdfDocument } from "../hooks/usePdfExtractor";

export interface PdfStudioHeaderControlsProps {
  doc: PdfDocument | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  /** Page the user is currently viewing in the synced reader. */
  activePage: number | null;
  totalPages: number;
  onJumpToPage: (n: number) => void;
  onOpenFind: () => void;
  onRunPipeline: () => void;
  pipelineRunning: boolean;
  onRunAiClean: () => void;
  aiCleanRunning: boolean;
  onOpenKnowledgeAssets: () => void;
  onOpenCopyPages: () => void;
  /** Reload the active document + per-page rows from Supabase. */
  onRefresh: () => void;
  refreshing: boolean;
  onOpenSource: () => void;
  /** Commit a new document name (renames doc + backing cloud file). */
  onRename: (newName: string) => void | Promise<void>;
  /** Archive (soft-delete) the active doc from the studio. */
  onDeleteDoc: (id: string) => Promise<void>;
}

export function PdfStudioHeaderControls({
  doc,
  sidebarOpen,
  onToggleSidebar,
  inspectorOpen,
  onToggleInspector,
  activePage,
  totalPages,
  onJumpToPage,
  onOpenFind,
  onRunPipeline,
  pipelineRunning,
  onRunAiClean,
  aiCleanRunning,
  onOpenKnowledgeAssets,
  onOpenCopyPages,
  onRefresh,
  refreshing,
  onOpenSource,
  onRename,
  onDeleteDoc,
}: PdfStudioHeaderControlsProps) {
  const saveBlob = useDownloadBlob();
  const openShare = useOpenShareModalWindow();
  const [downloading, setDownloading] = useState(false);

  const hasSource = !!doc && doc.sourceKind === "cld_file" && !!doc.sourceId;
  const actionsBusy = pipelineRunning || aiCleanRunning || refreshing;

  const handleDownload = useCallback(async () => {
    if (!doc?.sourceId || downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadFile(doc.sourceId);
      saveBlob({ blob, filename: filename ?? `${doc.name}.pdf` });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Download failed: ${err.message}`
          : "Download failed",
      );
    } finally {
      setDownloading(false);
    }
  }, [doc, downloading, saveBlob]);

  const handleShare = useCallback(() => {
    if (!doc?.sourceId) return;
    openShare({
      resourceType: "file",
      resourceId: doc.sourceId,
      resourceName: doc.name,
      isOwner: true,
    });
  }, [doc, openShare]);

  return (
    <div className="grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex min-w-0 items-center justify-self-start">
        <PanelLeftTapButton
          onClick={onToggleSidebar}
          ariaLabel={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        />
        <ChevronLeftTapButton
          href="/tools/pdf-extractor"
          ariaLabel="Back to studio"
        />
        {doc ? (
          <PdfStudioDocTitle
            doc={doc}
            onRename={onRename}
            onDeleteDoc={onDeleteDoc}
          />
        ) : (
          <span className="ml-2 truncate text-sm text-muted-foreground">
            Select a document
          </span>
        )}
      </div>

      <div className="justify-self-center">
        {doc && (
          <PageJumperTapGroup
            activePage={activePage}
            totalPages={totalPages}
            onJumpToPage={onJumpToPage}
          />
        )}
      </div>

      <div className="flex items-center justify-self-end">
        {doc && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MoreHorizontalTapButton ariaLabel="Document actions" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onRunPipeline} disabled={actionsBusy}>
                {pipelineRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Run pipeline
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRunAiClean} disabled={actionsBusy}>
                {aiCleanRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PartyPopper className="mr-2 h-4 w-4" />
                )}
                AI clean
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenKnowledgeAssets}>
                <WandSparkles className="mr-2 h-4 w-4" />
                Knowledge assets
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenCopyPages}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Copy pages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenFind}>
                <Search className="mr-2 h-4 w-4" />
                Find
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRefresh} disabled={actionsBusy}>
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </DropdownMenuItem>
              {hasSource && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleDownload()}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenSource}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open source
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <PanelRightTapButton
          onClick={onToggleInspector}
          ariaLabel={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
        />
      </div>
    </div>
  );
}

/** Compact `‹ N / total ›` page jumper — glass tap-group with an inline input. */
function PageJumperTapGroup({
  activePage,
  totalPages,
  onJumpToPage,
}: {
  activePage: number | null;
  totalPages: number;
  onJumpToPage: (n: number) => void;
}) {
  const total = Math.max(totalPages, 0);
  const [draft, setDraft] = React.useState("");

  // Sync the draft when the active page changes — derived-state pattern
  // (render-phase set with prop tracking), not an effect.
  const [syncedPage, setSyncedPage] = React.useState<number | null>(null);
  if (activePage !== syncedPage) {
    setSyncedPage(activePage);
    if (activePage != null) setDraft(String(activePage));
  }

  const submit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onJumpToPage(Math.min(n, Math.max(total, 1)));
  };

  return (
    <TapTargetButtonGroup>
      <ChevronLeftTapButton
        variant="group"
        onClick={() =>
          activePage && activePage > 1 && onJumpToPage(activePage - 1)
        }
        disabled={!activePage || activePage <= 1}
        ariaLabel="Previous page"
        tooltip="Previous page (k)"
      />
      <label className="flex h-6 items-center gap-0.5 px-0.5 text-[11px] tabular-nums text-foreground">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-7 bg-transparent text-center text-[11px] outline-none"
          inputMode="numeric"
          aria-label="Current page"
        />
        <span className="text-[11px] text-muted-foreground">
          / {total.toLocaleString()}
        </span>
      </label>
      <ChevronRightTapButton
        variant="group"
        onClick={() =>
          activePage &&
          total > 0 &&
          activePage < total &&
          onJumpToPage(activePage + 1)
        }
        disabled={!activePage || total <= 0 || activePage >= total}
        ariaLabel="Next page"
        tooltip="Next page (j)"
      />
    </TapTargetButtonGroup>
  );
}
