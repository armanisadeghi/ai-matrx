"use client";

// features/spaces/page/IconPicker.tsx — Notion's icon picker (A3), with Lucide icons in place of emoji.
//
// Tabs Icons / Upload / Link, "Random" and "Remove" top right, a search field and the grid. An upload
// lives for this tab only (an object URL), which the sample-data marker already says.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Field, SearchField, Tabs } from "@ai-matrx/design-system/controls";
import { useState, type ReactNode } from "react";

import { uploadSpaceImage } from "./media";
import type { SpaceMedia } from "../contract";
import { SPACE_ICONS, SPACE_ICON_NAMES } from "../icons-registry";

type Tab = "icons" | "upload" | "link";

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
  const [tab, setTab] = useState<Tab>("icons");
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const q = query.trim().toLowerCase();
  const names = q ? SPACE_ICON_NAMES.filter((n) => words(n).includes(q)) : SPACE_ICON_NAMES;
  const current = value && "icon" in value ? value.icon : null;
  const pick = (media: SpaceMedia | null) => {
    onChange(media);
    setOpen(false);
  };

  if (disabled) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[408px] max-w-[calc(100vw-16px)] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1 border-b border-border px-2">
          <Tabs<Tab>
            aria-label="Icon source"
            value={tab}
            onValueChange={setTab}
            rule={false}
            data={[
              { value: "icons", label: "Icons" },
              { value: "upload", label: "Upload" },
              { value: "link", label: "Link" },
            ]}
          />
          <span className="flex-1" />
          <Button variant="quiet" onClick={() => pick(randomIcon())}>
            Random
          </Button>
          <Button variant="quiet" onClick={() => pick(null)}>
            Remove
          </Button>
        </div>
        {tab === "icons" ? (
          <div className="p-2">
            <SearchField placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus className="w-full" />
            <div className="mt-2 grid max-h-[280px] grid-cols-12 gap-0.5 overflow-y-auto">
              {names.map((name) => {
                const Icon = SPACE_ICONS[name];
                return (
                  <button
                    key={name}
                    type="button"
                    title={words(name)}
                    aria-label={words(name)}
                    data-selected={current === name ? "true" : undefined}
                    className="flex aspect-square items-center justify-center rounded text-foreground/80 hover:bg-accent data-[selected=true]:bg-accent"
                    onClick={() => pick({ icon: name })}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </button>
                );
              })}
              {names.length === 0 ? <p className="col-span-12 py-6 text-center text-sm text-muted-foreground">No results</p> : null}
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
            <p className="text-xs text-muted-foreground">Recommended size is 280 × 280 pixels</p>
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
