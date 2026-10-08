"use client";

// features/spaces/editor/media-insert.tsx — C20 / C21 / C23 / N16: Notion's media picker.
//
// "/image", "/video", "/audio", "/file", "/pdf" open the picker under the line the "/" was typed on:
// Upload | Embed link. "/embed" and the provider items (Google Drive, Figma, …) open Embed link only. An
// upload goes through the platform's file handler and is stored as `{ fileId, name }` (never a signed URL);
// a link is stored as `{ url }`. The same picker answers a media block's Replace. The largest upload is the
// `spaces.media.max_upload_mb` knob.

import { Button, Field, Tabs } from "@ai-matrx/design-system/controls";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { fileHandler } from "@/features/files/handler/handler";
import { toast } from "@/lib/toast";

import { useSpacesKnob } from "../state/knobs";
import { EMBED_PROVIDERS, GENERIC_EMBED, embedTarget, type EmbedProviderKey } from "./embed-providers";

export type MediaKind = "image" | "video" | "audio" | "file" | "pdf";
export type PickedMedia = { fileId: string; name: string } | { url: string };

interface PickerRequest {
  kind: MediaKind | "embed" | "bookmark";
  provider?: EmbedProviderKey;
  anchor: DOMRect;
  onPick: (picked: PickedMedia) => void;
}

let current: PickerRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Open the picker under `anchor` (a block's element, or a rectangle). */
export function openMediaPicker(req: Omit<PickerRequest, "anchor"> & { anchor: Element | DOMRect | null }): void {
  const rect = req.anchor instanceof Element ? req.anchor.getBoundingClientRect() : (req.anchor ?? new DOMRect(window.innerWidth / 2 - 200, 120, 0, 0));
  current = { ...req, anchor: rect };
  emit();
}

export function closeMediaPicker(): void {
  current = null;
  emit();
}

/** The element of a block by id (the picker opens under it). */
export function blockElement(blockId: string | null): Element | null {
  if (!blockId || typeof document === "undefined") return null;
  return document.querySelector(`.spaces-editor .bn-block[data-id="${CSS.escape(blockId)}"]`) ?? document.querySelector(`[data-id="${CSS.escape(blockId)}"]`);
}

const ACCEPT: Record<MediaKind, string> = { image: "image/*", video: "video/*", audio: "audio/*", pdf: "application/pdf", file: "" };

/** Notion's wording per kind. */
const WORDS: Record<MediaKind | "embed" | "bookmark", { placeholder: string; button: string; note: string }> = {
  image: { placeholder: "Paste the image link…", button: "Embed image", note: "Works with any image from the web." },
  video: { placeholder: "Paste the video link…", button: "Embed video", note: "Works with YouTube, Vimeo, Loom and video files." },
  audio: { placeholder: "Paste the audio link…", button: "Embed audio", note: "Works with any audio file on the web." },
  file: { placeholder: "Paste the file link…", button: "Embed file", note: "Works with any file on the web." },
  pdf: { placeholder: "Paste the PDF link…", button: "Embed PDF", note: "Works with any PDF on the web." },
  embed: { placeholder: GENERIC_EMBED.placeholder, button: "Embed link", note: "Works with PDFs, Google Drive, Google Maps, CodePen…" },
  bookmark: { placeholder: "Paste in https://…", button: "Create bookmark", note: "Create a visual bookmark from a link." },
};

export async function uploadSpaceFile(file: File, maxMb: number): Promise<{ fileId: string; name: string } | null> {
  if (file.size > maxMb * 1024 * 1024) {
    toast.error(`${file.name} is larger than ${maxMb} MB`);
    return null;
  }
  try {
    const uploaded = await fileHandler.upload({ kind: "file", file });
    return { fileId: uploaded.fileId, name: file.name };
  } catch (err) {
    toast.error(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed");
    return null;
  }
}

function useRequest(): PickerRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

/** Mounted once per editor: draws the open picker. */
export function MediaPickerHost() {
  const req = useRequest();
  return req ? <MediaPicker key={`${req.kind}:${req.anchor.top}:${req.anchor.left}`} req={req} /> : null;
}

function MediaPicker({ req }: { req: PickerRequest }) {
  const maxMb = useSpacesKnob("maxUploadMb");
  const linkOnly = req.kind === "embed" || req.kind === "bookmark";
  const [tab, setTab] = useState<"upload" | "link">(linkOnly ? "link" : "upload");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: req.anchor.left, top: req.anchor.bottom + 6 });
  const provider = req.provider ? EMBED_PROVIDERS.find((p) => p.key === req.provider) : undefined;
  const words = WORDS[req.kind];

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const below = req.anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, req.anchor.top - h - 6) : below;
    setPos({ left: Math.max(8, Math.min(req.anchor.left, window.innerWidth - w - 8)), top });
  }, [req.anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) closeMediaPicker();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMediaPicker();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);

  const pick = (picked: PickedMedia) => {
    closeMediaPicker();
    req.onPick(picked);
  };
  const submitLink = () => {
    const url = link.trim();
    if (!url) return;
    if (!embedTarget(url)) {
      toast.error("That is not a web address");
      return;
    }
    pick({ url });
  };

  return createPortal(
    <div
      ref={panel}
      className="spaces-media-picker fixed z-50 w-[420px] max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      data-media-picker={req.kind}
      role="dialog"
      aria-label={provider ? provider.title : `Add ${req.kind}`}
    >
      <div className="flex items-center border-b border-border px-2">
        {linkOnly ? (
          <span className="px-2 py-2 text-sm font-medium">{provider ? provider.title : req.kind === "bookmark" ? "Bookmark" : "Embed link"}</span>
        ) : (
          <Tabs
            aria-label="Media source"
            value={tab}
            onValueChange={setTab}
            rule={false}
            data={[
              { value: "upload", label: "Upload" },
              { value: "link", label: "Embed link" },
            ]}
          />
        )}
      </div>
      {tab === "upload" && !linkOnly ? (
        <div className="flex flex-col items-center gap-2 p-3">
          <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border text-sm hover:bg-accent" data-busy={busy || undefined}>
            {busy ? "Uploading…" : "Upload file"}
            <input
              type="file"
              accept={ACCEPT[req.kind as MediaKind] || undefined}
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                void uploadSpaceFile(file, maxMb).then((up) => {
                  setBusy(false);
                  if (up) pick(up);
                });
              }}
            />
          </label>
          <p className="type-secondary text-muted-foreground">The maximum size per file is {maxMb} MB.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-3">
          <Field
            placeholder={provider?.placeholder ?? words.placeholder}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitLink();
              }
            }}
            autoFocus
            className="w-full"
          />
          <Button variant="primary" className="w-full max-w-[300px]" onClick={submitLink} disabled={!link.trim()}>
            {words.button}
          </Button>
          <p className="type-secondary text-muted-foreground">{provider ? provider.subtext : words.note}</p>
        </div>
      )}
    </div>,
    document.body,
  );
}
