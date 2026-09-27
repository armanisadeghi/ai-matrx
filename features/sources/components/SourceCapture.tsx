"use client";

/**
 * features/sources/components/SourceCapture.tsx — adding a Source and saving /
 * attaching Sources, once, for every surface that offers it (the Knowledge
 * hub's Add menu and bulk bar; moved here from the retired Sources page,
 * KNOWLEDGE-HUB §8 H6a).
 *
 *   SourceAddMenu    — Add: upload a file · paste a web address · paste text ·
 *                      import a transcript. A landed page or text opens the
 *                      Save panel (you choose where it goes next); an upload
 *                      starts its processing job on the caller's runner, so the
 *                      caller's progress sheet shows it.
 *   SourceSaveDialog — the Save panel in a dialog: Save (keep + file) or
 *                      Attach (file without re-saving) for one or many Sources.
 *
 * Every refusal is said where the person is looking: the Add dialogs show
 * theirs inside the dialog (a toast can be missed).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardType, FileAudio, Link2, Loader2, Plus, Upload } from "lucide-react";
import { Input, Textarea } from "@ai-matrx/design-system";
import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { fileHandler } from "@/features/files/handler/handler";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { ScrapeFailureNotice } from "@/features/scraper/parts/ScrapeFailureNotice";
import { landSource, sourceRefusalSentence, type LandingNotice } from "@/features/sources/api/sourcesApi";
import { buildPastedTextLanding } from "@/features/sources/api/pastedText";
import { addFailureSentence } from "@/features/sources/addFailure";
import { SaveSourcePanel, type SaveSourceItem } from "@/features/sources/SaveSourcePanel";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SaveTarget {
  items: SaveSourceItem[];
  notices: LandingNotice[];
  /** false = Attach (file without re-saving). */
  defaultSave: boolean;
}

export function SourceSaveDialog({
  target,
  onClose,
  onSettled,
  onSaved,
}: {
  target: SaveTarget | null;
  onClose: () => void;
  onSettled?: () => void;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {target?.defaultSave === false ? "Attach" : "Save"}{" "}
            {target && target.items.length === 1
              ? (target.items[0].name ?? "this Source")
              : `${target?.items.length ?? 0} Sources`}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <SaveSourcePanel
            sources={target.items}
            landingNotices={target.notices}
            defaultSave={target.defaultSave}
            embedded
            onSettled={onSettled}
            onCancel={onClose}
            onSaved={() => {
              onClose();
              onSaved?.();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type AddMode = null | "url" | "text";

export function SourceAddMenu({
  runner,
  onLanded,
  onJobStarted,
}: {
  runner: UseProcessingRunner;
  /** A Source landed (or its save settled): re-read the list. */
  onLanded: () => void;
  /** An upload started its processing job: show the progress sheet on it. */
  onJobStarted?: (jobId: string) => void;
}) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textName, setTextName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const { scrapeUrl, failure: scrapeFailure, reset: resetScrape } = useScraperApi();

  const openMode = (m: AddMode) => {
    setAddError(null);
    resetScrape();
    setAddMode(m);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const tid = toast.loading(`Uploading ${file.name}…`);
    try {
      // A Source is organization data (Arman 2026-09-26).
      const normalized = await fileHandler.upload({ kind: "file", file }, { visibility: "internal" });
      toast.dismiss(tid);
      if (!normalized.fileId) {
        toast.error("The upload finished but the server did not return the file, so it could not be processed.");
        return;
      }
      toast.success("Uploaded — processing it now.");
      onLanded();
      const jobId = await runner.runForCldFile(
        normalized.fileId,
        file.name,
        `Upload + full pipeline (extract → clean → ${RAG_VOCAB.segmentStage} → embed)`,
      );
      onJobStarted?.(jobId);
    } catch (err) {
      toast.dismiss(tid);
      toast.error(sourceRefusalSentence(err));
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setAdding(true);
    setAddError(null);
    try {
      // Name the organization first: the scraper refuses without one.
      await ensureOrgId(activeOrgId);
      const result = await scrapeUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (!result) return; // the hook's `failure` is rendered in the dialog
      if (!result.processedDocumentId) {
        setAddError(
          result.sourceNotices[0]?.message ??
            "The page was read but did not become a Source, and the server did not say why. Try again.",
        );
        return;
      }
      setAddMode(null);
      setUrlInput("");
      resetScrape();
      onLanded();
      setSaveTarget({
        items: [{ processedDocumentId: result.processedDocumentId, name: result.overview?.page_title || result.url }],
        notices: result.sourceNotices,
        defaultSave: true,
      });
    } catch (err) {
      setAddError(addFailureSentence(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddText = async () => {
    if (!textInput.trim()) return;
    if (!userId) {
      setAddError("Your sign-in is still loading, so nothing was added. Try again in a moment.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const body = await buildPastedTextLanding({ text: textInput, name: textName, organizationId, userId });
      const landed = await landSource(body);
      setAddMode(null);
      setTextInput("");
      setTextName("");
      onLanded();
      setSaveTarget({
        items: [{ processedDocumentId: landed.processed_document_id, name: body.name, organizationId }],
        notices: landed.notices ?? [],
        defaultSave: true,
      });
    } catch (err) {
      setAddError(addFailureSentence(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        data-testid="source-upload-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TapTargetButtonSolid
            icon={<Plus className="h-4 w-4" />}
            ariaLabel="Add a Source"
            label={uploading ? "Uploading…" : "Add"}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Upload a file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMode("url")}>
            <Link2 className="mr-2 h-4 w-4" /> Paste a web address
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMode("text")}>
            <ClipboardType className="mr-2 h-4 w-4" /> Paste text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/transcripts/studio")}>
            <FileAudio className="mr-2 h-4 w-4" /> Import a transcript
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addMode === "url"} onOpenChange={(o) => !o && setAddMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste a web address</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddUrl();
            }}
          >
            <Input autoFocus placeholder="https://example.com/article" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              We read the page and add it to your Sources; you choose where to save it next.
            </p>
            {scrapeFailure && !adding ? <ScrapeFailureNotice failure={scrapeFailure} /> : null}
            {addError && !adding ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
                <ErrorAlchemyMenu className="ml-auto" />
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddMode(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={adding || !urlInput.trim()}>
                {adding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Read the page
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addMode === "text"} onOpenChange={(o) => !o && setAddMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste text</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name (optional — the first line is used)" value={textName} onChange={(e) => setTextName(e.target.value)} />
            <Textarea autoFocus rows={10} placeholder="Paste the text here" value={textInput} onChange={(e) => setTextInput(e.target.value)} />
            {addError && !adding ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
                <ErrorAlchemyMenu className="ml-auto" />
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddMode(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={adding || !textInput.trim()} onClick={() => void handleAddText()}>
                {adding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Add to Sources
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SourceSaveDialog target={saveTarget} onClose={() => setSaveTarget(null)} onSettled={onLanded} onSaved={onLanded} />
    </>
  );
}
