"use client";

/**
 * Base64DecoderShell — interactive body of the /image-studio/from-base64 route.
 *
 * Two-column layout (stacks on mobile):
 *   • Left  — paste box for the base64 string (raw or `data:` URL).
 *   • Right — preview, decoded metadata, filename / folder controls,
 *             save-to-cloud action, and the resulting share URL.
 *
 * Decode runs entirely in the browser — see `useBase64Decoder` for the
 * pipeline. The only network call is the upload, which goes through the
 * same cloud-files share-link primitive every other Image Studio feature
 * uses, so the resulting URL is persistent (not a 60-min signed URL).
 */

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  Library,
  Loader2,
  Lightbulb,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BasicInput } from "@/components/ui/input";
import { BasicTextarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useBase64Decoder } from "../hooks/useBase64Decoder";
import { mimeTypeLabel } from "../utils/decode-base64";
import { formatBytes } from "../utils/format-bytes";

interface Base64DecoderShellProps {
  defaultFolder?: string;
}

export function Base64DecoderShell({ defaultFolder }: Base64DecoderShellProps) {
  const decoder = useBase64Decoder({ defaultFolder });
  const {
    input,
    setInput,
    decoded,
    decodeError,
    filenameBase,
    setFilenameBase,
    fullFilename,
    folder,
    setFolder,
    isSaving,
    saveError,
    saveResult,
    clear,
    pasteFromClipboard,
    save,
  } = decoder;

  const handleSave = useCallback(async () => {
    const result = await save();
    if (result) {
      toast.success("Saved to your library");
    }
  }, [save]);

  const handleSaveKeydown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (decoded && !isSaving) void handleSave();
      }
    },
    [decoded, handleSave, isSaving],
  );

  const handleDownload = useCallback(() => {
    if (!decoded) return;
    const a = document.createElement("a");
    a.href = decoded.previewUrl;
    a.download = fullFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [decoded, fullFilename]);

  const inputCharCount = input.length;
  const showInputHint = !input;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-3 md:gap-4 p-3 md:p-5 h-full min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden">
      {/* LEFT — Input column ──────────────────────────────────── */}
      <div className="flex flex-col min-h-0 gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-primary" />
              Paste your base64
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Raw base64 or a full{" "}
              <code className="font-mono text-[11px]">
                data:image/…;base64,
              </code>{" "}
              URL — both work. Whitespace and line breaks are ignored.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pasteFromClipboard}
              className="gap-1.5"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={!input && !decoded}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0">
          <BasicTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleSaveKeydown}
            placeholder={`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...

or just paste the raw base64 payload — we'll detect the format from the bytes.`}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="font-mono text-xs leading-relaxed resize-none h-full min-h-[280px]"
            // 16px to prevent iOS auto-zoom on focus.
            style={{ fontSize: 16, minHeight: 280 }}
          />
          {showInputHint && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  ⌘/Ctrl V
                </kbd>
                paste
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  ⌘/Ctrl ↵
                </kbd>
                save
              </span>
            </div>
          )}
        </div>

        {/* Char counter + decode status */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground tabular-nums">
            {inputCharCount > 0
              ? `${inputCharCount.toLocaleString()} characters`
              : "—"}
          </div>
          <DecodeStatus
            isDecoded={!!decoded}
            isError={!!decodeError && !!input.trim()}
          />
        </div>

        {/* Errors */}
        {decodeError && input.trim() && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="flex-1">{decodeError}</p>
          </div>
        )}
      </div>

      {/* RIGHT — Preview + actions ──────────────────────────────── */}
      <div className="flex flex-col min-h-0 gap-3">
        <PreviewCard decoded={decoded} fullFilename={fullFilename} />

        {decoded && (
          <>
            <MetadataRow decoded={decoded} />
            {decoded.declaredMimeType &&
              decoded.declaredMimeType !== decoded.mimeType && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="flex-1">
                    The data URL header said{" "}
                    <span className="font-mono">
                      {decoded.declaredMimeType}
                    </span>{" "}
                    but the actual bytes are{" "}
                    <span className="font-mono">{decoded.mimeType}</span>.
                    We&rsquo;re saving as the real format.
                  </p>
                </div>
              )}

            <NameAndFolder
              filenameBase={filenameBase}
              setFilenameBase={setFilenameBase}
              fullFilename={fullFilename}
              folder={folder}
              setFolder={setFolder}
            />

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !!saveResult}
                className="flex-1 gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : saveResult ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <CloudUpload className="h-4 w-4" />
                    Save to library
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                className="gap-2"
                title="Download the decoded image"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="flex-1">{saveError}</p>
              </div>
            )}

            {saveResult && (
              <SaveResultPanel
                shareUrl={saveResult.shareUrl}
                fileId={saveResult.fileId}
              />
            )}
          </>
        )}

        {!decoded && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <FileImage className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium">Preview & save</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Paste a base64 string on the left. We&rsquo;ll decode it, detect
              the format, and let you save it as a cloud-hosted image with a
              shareable URL.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function DecodeStatus({
  isDecoded,
  isError,
}: {
  isDecoded: boolean;
  isError: boolean;
}) {
  if (isError) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertCircle className="h-3 w-3" />
        Invalid input
      </span>
    );
  }
  if (isDecoded) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3 w-3" />
        Decoded
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Awaiting input…</span>;
}

function PreviewCard({
  decoded,
  fullFilename,
}: {
  decoded: ReturnType<typeof useBase64Decoder>["decoded"];
  fullFilename: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <p className="text-xs font-medium truncate" title={fullFilename}>
          {fullFilename}
        </p>
        {decoded && (
          <Badge
            variant="secondary"
            className="text-[10px] uppercase tracking-wider"
          >
            {mimeTypeLabel(decoded.mimeType)}
          </Badge>
        )}
      </div>
      <div
        className={cn(
          "relative w-full aspect-square flex items-center justify-center overflow-hidden",
          // Checkered transparency background — `bg-checkerboard` is the
          // shared utility used by the existing image editor.
          "bg-checkerboard",
        )}
      >
        {decoded ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={decoded.previewUrl}
            alt={fullFilename}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <FileImage className="h-10 w-10 opacity-40" />
            <p className="text-xs">No preview yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataRow({
  decoded,
}: {
  decoded: NonNullable<ReturnType<typeof useBase64Decoder>["decoded"]>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Format" value={mimeTypeLabel(decoded.mimeType)} />
      <Stat label="Size" value={formatBytes(decoded.byteLength)} />
      <Stat
        label="Dimensions"
        value={
          decoded.width && decoded.height
            ? `${decoded.width} × ${decoded.height}`
            : "—"
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function NameAndFolder({
  filenameBase,
  setFilenameBase,
  fullFilename,
  folder,
  setFolder,
}: {
  filenameBase: string;
  setFilenameBase: (next: string) => void;
  fullFilename: string;
  folder: string;
  setFolder: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor="b64-filename">
          Filename
        </Label>
        <BasicInput
          id="b64-filename"
          value={filenameBase}
          onChange={(e) => setFilenameBase(e.target.value)}
          placeholder="decoded"
          // 16px to prevent iOS auto-zoom on focus.
          style={{ fontSize: 16 }}
        />
        <p className="text-[11px] text-muted-foreground truncate">
          Saves as <span className="font-mono">{fullFilename}</span>
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor="b64-folder">
          Folder
        </Label>
        <BasicInput
          id="b64-folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="from-base64"
          style={{ fontSize: 16 }}
        />
        <p className="text-[11px] text-muted-foreground">
          Stored under{" "}
          <span className="font-mono">
            Images/Generated/{folder || "from-base64"}
          </span>
        </p>
      </div>
    </div>
  );
}

function SaveResultPanel({
  shareUrl,
  fileId,
}: {
  shareUrl: string;
  fileId: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) {
      toast.error("No share URL available");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("URL copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not access the clipboard");
    }
  }, [shareUrl]);

  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Image saved — share URL ready
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-xs font-mono"
          onFocus={(e) => e.currentTarget.select()}
          style={{ fontSize: 16 }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="gap-1.5 shrink-0"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
        <Link
          href={`/files/f/${fileId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Library className="h-3 w-3" />
          Open in Files
        </Link>
      </div>
    </div>
  );
}
