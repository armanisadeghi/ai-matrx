"use client";

/**
 * PdfSourcePicker — pick a PDF to send to a `/utilities/pdf/*` endpoint.
 *
 * Uses the canonical universal file-handler primitives only:
 *
 *  - **Upload** path → `useFileUpload()` from `features/files/handler`. The
 *    raw `File` is wrapped in the `FileSource` discriminated union
 *    (`{ kind: "file", file }`) — `fileHandler` then does the rest
 *    (Python `/files/upload`, optimistic Redux updates, optional share
 *    links).
 *  - **Pick existing** path → `useFilePicker()` from `features/files`. Opens
 *    the adaptive Dialog↔Drawer that browses the user's cld_files tree
 *    and returns the chosen file id.
 *  - **URL** path → just records the URL on the request body so the backend
 *    fetches it through `FileManager.resolve_media_async`.
 *
 * Output: exactly one of `media: { file_id }` / `url` is set, mirroring
 * the backend's `_SourceMixin` request shape.
 */

import { useState } from "react";
import { Upload, Link as LinkIcon, FolderOpen, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFileUpload } from "@/features/files";
import { useFilePicker } from "@/features/files";
import { toast } from "sonner";

export interface PdfSourcePayload {
  /** Canonical MediaRef shape — `file_id` is the cld_files UUID. */
  media?: { file_id: string } | null;
  url?: string | null;
}

export interface PdfSourceState {
  /** Body fragment to merge into any `/utilities/pdf/*` request body. */
  payload: PdfSourcePayload | null;
  /** Human label for the source — used in result-pane summaries. */
  label: string;
}

interface Props {
  value: PdfSourceState;
  onChange: (next: PdfSourceState) => void;
}

const EMPTY: PdfSourceState = { payload: null, label: "" };

export const EMPTY_PDF_SOURCE: PdfSourceState = EMPTY;

export function PdfSourcePicker({ value, onChange }: Props) {
  const { upload, uploading, error: uploadError } = useFileUpload();
  const { open: openPicker, element: pickerElement } = useFilePicker();
  const [urlInput, setUrlInput] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (
      !file.type.includes("pdf") &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Please choose a .pdf file.");
      return;
    }
    try {
      const normalized = await upload(
        { kind: "file", file },
        {
          folderPath: "Inbox/PDF Demo",
          visibility: "private",
        },
      );
      if (!normalized.fileId) {
        throw new Error("Upload did not return a fileId.");
      }
      onChange({
        payload: { media: { file_id: normalized.fileId } },
        label: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      });
      toast.success("Uploaded — ready to send to the API.");
    } catch (err) {
      console.error("[PdfSourcePicker] upload failed", err);
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function pickExisting() {
    const ids = await openPicker({
      multi: false,
      allowedExtensions: ["pdf"],
      title: "Choose a PDF",
      description: "Pick a PDF that's already in your cloud files.",
    });
    if (!ids || !ids.length) return;
    onChange({
      payload: { media: { file_id: ids[0] } },
      label: `cld_files: ${ids[0].slice(0, 8)}…`,
    });
    toast.success("PDF selected.");
  }

  function commitUrl() {
    const v = urlInput.trim();
    if (!v) return;
    onChange({
      payload: { url: v },
      label: v,
    });
    toast.success("Source set to URL.");
  }

  function clear() {
    onChange(EMPTY);
    setUrlInput("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">PDF source</Label>
        {value.payload ? (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
      </div>

      {value.payload ? (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-primary" />
          <span className="truncate" title={value.label}>
            {value.label}
          </span>
        </div>
      ) : (
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1" /> Upload
            </TabsTrigger>
            <TabsTrigger value="pick">
              <FolderOpen className="h-3.5 w-3.5 mr-1" /> Cloud
            </TabsTrigger>
            <TabsTrigger value="url">
              <LinkIcon className="h-3.5 w-3.5 mr-1" /> URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-2 pt-3">
            <Input
              type="file"
              accept="application/pdf,.pdf"
              disabled={uploading}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Routes through the universal file handler — the file lands in
                cld_files and only its id is sent to the API.
              </p>
            )}
            {uploadError ? (
              <p className="text-xs text-destructive">{uploadError.message}</p>
            ) : null}
          </TabsContent>

          <TabsContent value="pick" className="space-y-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pickExisting}
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1" /> Browse cloud files
            </Button>
            <p className="text-xs text-muted-foreground">
              Pick a PDF that's already in your cloud-files library.
            </p>
          </TabsContent>

          <TabsContent value="url" className="space-y-2 pt-3">
            <Input
              placeholder="https://…/some.pdf"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!urlInput.trim()}
              onClick={commitUrl}
            >
              Use URL
            </Button>
            <p className="text-xs text-muted-foreground">
              Backend resolves the URL through FileManager — any URL we issued
              (share links, /files/&#123;id&#125;/url) is recognised; external
              URLs get fetched.
            </p>
          </TabsContent>
        </Tabs>
      )}

      {pickerElement}
    </div>
  );
}
