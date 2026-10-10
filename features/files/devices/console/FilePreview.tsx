/**
 * A file on the device, previewed in place: text (first 256 KB) and images (up to 4 MB) inline;
 * anything else shows what it is. A plain Dialog — a bottom sheet on phones by itself. Download
 * saves the bytes through the browser for files up to 4 MB (one fs.read).
 */

"use client";

import { useEffect, useState } from "react";
import { Copy, Download, File as FileIcon } from "lucide-react";
import type { DesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { FsEntry } from "@ai-matrx/desktop-protocol";
import { formatAbsoluteDate, formatFileSize } from "@ai-matrx/kit/format";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { imageMime, previewKind } from "./paths";
import { copyToClipboard } from "@/lib/clipboard/copy";
import { downloadFile } from "@ai-matrx/kit/download";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const TEXT_LIMIT = 262_144;
const BINARY_LIMIT = 4 * 1024 * 1024;

type Loaded =
  | { kind: "loading" }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "image"; src: string }
  | { kind: "none" }
  | { kind: "error"; message: string };

function base64ToBlob(content: string, mime: string): Blob {
  const bin = atob(content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function FilePreview({ client, entry, onOpenChange }: { client: DesktopClient; entry: FsEntry | null; onOpenChange: (open: boolean) => void }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    if (!entry) return undefined;
    const abort = new AbortController();
    setLoaded({ kind: "loading" });
    const kind = previewKind(entry.name);
    if (kind === "none" || (kind === "image" && entry.size > BINARY_LIMIT)) {
      setLoaded({ kind: "none" });
      return undefined;
    }
    let objectUrl: string | null = null;
    client
      .request(
        "fs.read",
        kind === "text" ? { path: entry.path, encoding: "utf8", limit: TEXT_LIMIT } : { path: entry.path, encoding: "base64", limit: BINARY_LIMIT },
        { signal: abort.signal },
      )
      .then(
        (res) => {
          if (kind === "text") {
            setLoaded({ kind: "text", text: res.content, truncated: res.truncated });
          } else {
            objectUrl = URL.createObjectURL(base64ToBlob(res.content, imageMime(entry.name, res.mime)));
            setLoaded({ kind: "image", src: objectUrl });
          }
        },
        (error: unknown) => {
          if (abort.signal.aborted) return;
          setLoaded({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        },
      );
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, entry]);

  async function download(): Promise<void> {
    if (!entry) return;
    try {
      const res = await client.request("fs.read", { path: entry.path, encoding: "base64", limit: BINARY_LIMIT });
      downloadFile(entry.name, base64ToBlob(res.content, res.mime ?? "application/octet-stream"), res.mime ?? "application/octet-stream");
    } catch (error) {
      toast.error("Could not download", { description: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{entry?.name ?? ""}</DialogTitle>
          <DialogDescription>
            {entry ? `${formatFileSize(entry.size)} · ${formatAbsoluteDate(entry.mtime * 1000, { dateStyle: "medium", timeStyle: "short" })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[120px] flex-1 overflow-auto rounded-md border border-border bg-muted/30">
          {loaded.kind === "loading" ? <div className="m-3 h-24 animate-pulse rounded bg-muted" /> : null}
          {loaded.kind === "text" ? (
            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-[1.45] text-foreground">
              {loaded.text}
              {loaded.truncated ? <span className="mt-2 block text-muted-foreground">First 256 KB</span> : null}
            </pre>
          ) : null}
          {loaded.kind === "image" ? (
            // A data blob from the device: next/image cannot optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loaded.src} alt={entry?.name ?? ""} className="mx-auto max-h-[60dvh] object-contain p-2" />
          ) : null}
          {loaded.kind === "none" ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
              No preview for this file
            </div>
          ) : null}
          {loaded.kind === "error" ? <p className="p-3 text-sm text-destructive">{loaded.message}<ErrorAlchemyMenu error={loaded.message} /></p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
            onClick={() => {
              if (entry) void copyToClipboard(entry.path, "Path copied");
            }}
          >
            <Copy className="h-4 w-4" />
            Copy path
          </button>
          {entry && entry.size <= BINARY_LIMIT ? (
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90" onClick={() => void download()}>
              <Download className="h-4 w-4" />
              Download
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
