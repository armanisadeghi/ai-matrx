"use client";

// features/spaces/page/IconPicker.tsx — Notion's icon picker (A3), opens on Emoji (search, categories, recently used, skin tone, Random), then Icons (Lucide) / Upload / Link.
//
// Tabs Icons / Upload / Link, "Random" and "Remove" top right, a search field and the grid. An upload
// lives for this tab only (an object URL), which the sample-data marker already says.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Field, SearchField, Tabs } from "@ai-matrx/design-system/controls";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

import { ICON_PICTURES } from "./gallery";
import { uploadSpaceImage } from "./media";
import type { SpaceMedia } from "../contract";
import { SPACE_ICON_NAMES, allIconNames } from "../icons-registry";
import { SpaceIcon } from "./SpaceIcon";

type Tab = "emoji" | "icons" | "upload" | "link";

// The emoji dataset (maintained npm package) loads only when the Emoji tab opens.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false, loading: () => <div className="h-[340px]" aria-busy /> });

// Unicode blocks where every code point is an emoji: faces, animals, food, transport.
const EMOJI_RANGES: Array<[number, number]> = [[0x1f600, 0x1f64f], [0x1f400, 0x1f43e], [0x1f345, 0x1f37a], [0x1f680, 0x1f6c5], [0x1f990, 0x1f9ac]];

export function randomEmoji(): SpaceMedia {
  const total = EMOJI_RANGES.reduce((n, [a, b]) => n + (b - a + 1), 0);
  let i = Math.floor(Math.random() * total);
  for (const [a, b] of EMOJI_RANGES) {
    if (i <= b - a) return { emoji: String.fromCodePoint(a + i) };
    i -= b - a + 1;
  }
  return { emoji: String.fromCodePoint(0x1f600) };
}

function words(name: string): string {
  return name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
}

export function randomIcon(): SpaceMedia {
  return { icon: SPACE_ICON_NAMES[Math.floor(Math.random() * SPACE_ICON_NAMES.length)] };
}

export function IconPicker({
  value,
  onChange,
  children,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: {
  value: SpaceMedia | null | undefined;
  onChange: (media: SpaceMedia | null) => void;
  children: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [tab, setTab] = useState<Tab>("emoji");
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const q = query.trim().toLowerCase();
  // A search reaches every Lucide icon (curated first), loaded once on the first typed letter.
  const [every, setEvery] = useState<string[] | null>(null);
  useEffect(() => {
    if (q && !every) void allIconNames().then(setEvery, (e: unknown) => console.error("[spaces] icon names", e));
  }, [q, every]);
  const curated = q ? SPACE_ICON_NAMES.filter((n) => words(n).includes(q)) : SPACE_ICON_NAMES;
  const more = q && every ? every.filter((n) => !curated.includes(n) && words(n).includes(q)).slice(0, 144) : [];
  const names = [...curated, ...more];
  const current = value && "icon" in value ? value.icon : null;
  const pick = (media: SpaceMedia | null) => {
    onChange(media);
    setOpen(false);
  };

  if (disabled) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent surface="solid" align="start" width="xl" padding="none" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1 border-b border-border px-2">
          <Tabs<Tab>
            aria-label="Icon source"
            value={tab}
            onValueChange={setTab}
            rule={false}
            data={[
              { value: "emoji", label: "Emoji" },
              { value: "icons", label: "Icons" },
              { value: "upload", label: "Upload" },
              { value: "link", label: "Link" },
            ]}
          />
          <span className="flex-1" />
          <Button variant="quiet" onClick={() => pick(tab === "emoji" ? randomEmoji() : randomIcon())}>
            Random
          </Button>
          <Button variant="quiet" onClick={() => pick(null)}>
            Remove
          </Button>
        </div>
        {tab === "emoji" ? (
          <EmojiPicker
            width="100%"
            height={340}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            searchPlaceholder="Search"
            onEmojiClick={(e) => pick({ emoji: e.emoji })}
          />
        ) : null}
        {tab === "icons" ? (
          <div className="p-2">
            <SearchField placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus className="w-full" />
            {!q ? (
              <div className="mt-2 flex gap-1">
                {ICON_PICTURES.map((pic) => (
                  <button key={pic.key} type="button" title={pic.label} aria-label={pic.label} className="size-10 rounded bg-cover bg-center hover:opacity-85" style={{ backgroundImage: `url("${pic.src}")` }} onClick={() => pick({ url: `gallery:${pic.key}` })} />
                ))}
              </div>
            ) : null}
            <div className="mt-2 grid max-h-[280px] grid-cols-12 gap-0.5 overflow-y-auto">
              {names.map((name) => {
                return (
                  <Button variant="quiet" icon={<SpaceIcon media={{ icon: name }} size={20} />} key={name} title={words(name)} aria-label={words(name)} data-selected={current === name ? "true" : undefined} onClick={() => pick({ icon: name })} className="aspect-square" />
                );
              })}
              {names.length === 0 ? <p className="col-span-12 py-6 text-center type-body text-muted-foreground">No results</p> : null}
            </div>
          </div>
        ) : null}
        {tab === "upload" ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded-md border border-border text-sm hover:bg-accent">
              Upload an image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadSpaceImage(file).then((media) => media && pick(media));
                }}
              />
            </label>
            <p className="type-secondary text-muted-foreground">Recommended size is 280 × 280 pixels</p>
          </div>
        ) : null}
        {tab === "link" ? (
          <form
            className="flex flex-col gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) pick({ url: link.trim() });
            }}
          >
            <Field placeholder="Paste an image link…" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
            <Button variant="primary" type="submit" className="self-center">
              Submit
            </Button>
          </form>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
