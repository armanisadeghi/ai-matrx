"use client";

// features/spaces/page/Cover.tsx — the full-bleed cover (A4): gallery / upload / link, Change cover,
// Reposition (drag, Save position / Cancel), Remove.
//
// The gallery is Notion's: a "Color & gradient" row drawn with CSS and a row of landscape pictures
// bundled with the feature (page/gallery.ts) — both stored as `gallery:<key>`. Uploads go through our
// file handler and are stored as `{ fileId }`.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Field, Tabs } from "@ai-matrx/design-system/controls";
import { useRef, useState } from "react";

import type { SpaceDoc } from "../contract";
import { COVER_PHOTOS, galleryImage } from "./gallery";
import { uploadSpaceImage, useSpaceMediaUrl } from "./media";

type CoverValue = NonNullable<SpaceDoc["cover"]>;

export const COVER_GALLERY: Record<string, string> = {
  "gradient-sunset": "linear-gradient(135deg, #f6d365 0%, #fda085 45%, #2f7d6d 100%)",
  "gradient-ocean": "linear-gradient(135deg, #2e3192 0%, #1bffff 100%)",
  "gradient-dusk": "linear-gradient(135deg, #42275a 0%, #734b6d 100%)",
  "gradient-meadow": "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
  "gradient-peach": "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "gradient-sky": "linear-gradient(180deg, #a1c4fd 0%, #c2e9fb 100%)",
  "solid-red": "#e16259",
  "solid-yellow": "#dfab01",
  "solid-blue": "#0b6e99",
  "solid-beige": "#e8dfd0",
  "solid-green": "#4d6461",
  "solid-gray": "#9b9a97",
};

const GALLERY_KEYS = Object.keys(COVER_GALLERY);
const RANDOM_KEYS = [...COVER_PHOTOS.map((p) => p.key), ...GALLERY_KEYS];

export function randomCover(): CoverValue {
  return { url: `gallery:${RANDOM_KEYS[Math.floor(Math.random() * RANDOM_KEYS.length)]}`, offsetY: 50 };
}

function coverStyle(cover: CoverValue, url: string | null, offsetY: number): React.CSSProperties {
  if ("url" in cover && cover.url.startsWith("gallery:") && !galleryImage(cover.url)) {
    return { background: COVER_GALLERY[cover.url.slice("gallery:".length)] ?? COVER_GALLERY["solid-gray"] };
  }
  if (url) {
    return { backgroundImage: `url("${url.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: `center ${offsetY}%` };
  }
  return { background: "var(--muted)" };
}

function CoverPicker({ onPick, children }: { onPick: (cover: CoverValue | null) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"gallery" | "upload" | "link">("gallery");
  const [link, setLink] = useState("");
  const pick = (cover: CoverValue | null) => {
    onPick(cover);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="2xl" padding="none">
        <div className="flex items-center gap-1 border-b border-border px-2">
          <Tabs
            aria-label="Cover source"
            value={tab}
            onValueChange={setTab}
            rule={false}
            data={[
              { value: "gallery", label: "Gallery" },
              { value: "upload", label: "Upload" },
              { value: "link", label: "Link" },
            ]}
          />
          <span className="flex-1" />
          <Button variant="quiet" onClick={() => pick(null)}>
            Remove
          </Button>
        </div>
        {tab === "gallery" ? (
          <div className="p-3">
            <p className="mb-2 type-secondary text-muted-foreground">Color &amp; gradient</p>
            <div className="grid grid-cols-4 gap-2">
              {GALLERY_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key.replace("-", " ")}
                  className="h-16 rounded hover:opacity-85"
                  style={{ background: COVER_GALLERY[key] }}
                  onClick={() => pick({ url: `gallery:${key}`, offsetY: 50 })}
                />
              ))}
            </div>
            <p className="mt-3 mb-2 type-secondary text-muted-foreground">Landscapes</p>
            <div className="grid grid-cols-4 gap-2">
              {COVER_PHOTOS.map((photo) => (
                <button
                  key={photo.key}
                  type="button"
                  aria-label={photo.label}
                  title={photo.label}
                  className="h-16 rounded bg-cover bg-center hover:opacity-85"
                  style={{ backgroundImage: `url("${photo.src}")` }}
                  onClick={() => pick({ url: `gallery:${photo.key}`, offsetY: 50 })}
                />
              ))}
            </div>
          </div>
        ) : null}
        {tab === "upload" ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border text-sm hover:bg-accent">
              Upload file
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadSpaceImage(file).then((media) => media && pick({ ...media, offsetY: 50 }));
                }}
              />
            </label>
            <p className="type-secondary text-muted-foreground">Images wider than 1500 pixels work best.</p>
          </div>
        ) : null}
        {tab === "link" ? (
          <div className="flex flex-col gap-2 p-3">
            <Field
              placeholder="Paste an image link…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && link.trim()) pick({ url: link.trim(), offsetY: 50 });
              }}
              autoFocus
            />
            <Button variant="primary" className="self-center" onClick={() => link.trim() && pick({ url: link.trim(), offsetY: 50 })}>
              Submit
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function Cover({ cover, editable, onChange }: { cover: CoverValue; editable: boolean; onChange: (cover: CoverValue | null) => void }) {
  const [repositioning, setRepositioning] = useState(false);
  const [offset, setOffset] = useState(cover.offsetY ?? 50);
  const drag = useRef<{ y: number; start: number; height: number } | null>(null);
  const url = useSpaceMediaUrl(cover);
  const isImage = "fileId" in cover || ("url" in cover && (!cover.url.startsWith("gallery:") || galleryImage(cover.url) !== null));
  const shown = repositioning ? offset : (cover.offsetY ?? 50);

  return (
    <div
      className="spaces-cover group/cover"
      data-repositioning={repositioning ? "true" : undefined}
      style={coverStyle(cover, url, shown)}
      onPointerDown={(e) => {
        if (!repositioning) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, start: offset, height: e.currentTarget.getBoundingClientRect().height };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const delta = ((e.clientY - drag.current.y) / drag.current.height) * -100;
        setOffset(Math.min(100, Math.max(0, drag.current.start + delta)));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {repositioning ? <span className="spaces-cover-hint">Drag image to reposition</span> : null}
      {editable ? (
        <div className="spaces-cover-actions">
          {repositioning ? (
            <>
              <Button variant="quiet" onClick={() => {
                  onChange({ ...cover, offsetY: offset });
                  setRepositioning(false);
                }}>
                Save position
              </Button>
              <Button variant="quiet" onClick={() => {
                  setOffset(cover.offsetY ?? 50);
                  setRepositioning(false);
                }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <CoverPicker onPick={onChange}>
                <Button variant="quiet">
                  Change cover
                </Button>
              </CoverPicker>
              {isImage ? (
                <Button variant="quiet" onClick={() => {
                    setOffset(cover.offsetY ?? 50);
                    setRepositioning(true);
                  }}>
                  Reposition
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
