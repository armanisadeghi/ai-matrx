"use client";

import React, { useState } from "react";
import {
  Pencil,
  Pin,
  Copy,
  Trash2,
  Star,
  Hash,
  Folder,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { ItemRow } from "@/components/official/item/ItemRow";
import type { ItemMenuConfig } from "@/components/official/item/types";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

interface DemoItem {
  id: string;
  title: string;
  favorite?: boolean;
  streaming?: boolean;
}

const INITIAL: DemoItem[] = [
  { id: "a", title: "Q3 go-to-market strategy and competitive positioning deep-dive", favorite: true },
  { id: "b", title: "Pipeline refactor — extract the shared NER routing layer", streaming: true },
  { id: "c", title: "Notes" },
  { id: "d", title: "Untitled draft from the weekly sync that nobody has renamed yet" },
];

const rowMenu = (item: DemoItem, fav: boolean): ItemMenuConfig => ({
  header: { title: item.title },
  sections: [
    {
      id: "actions",
      items: [
        { id: "rename", label: "Rename", icon: Pencil, intent: "rename", shortcutKey: "r", onSelect: () => {} },
        {
          id: "pin",
          label: fav ? "Unpin" : "Pin",
          icon: Pin,
          iconClassName: fav ? "text-amber-500" : undefined,
          shortcutKey: "p",
          onSelect: () => void toast.success(fav ? "Unpinned" : "Pinned"),
        },
        { id: "duplicate", label: "Duplicate", icon: Copy, shortcutKey: "d", onSelect: () => void toast.success("Duplicated") },
      ],
    },
    {
      id: "danger",
      items: [
        { id: "delete", label: "Delete", icon: Trash2, tone: "destructive", onSelect: () => void toast.error("Deleted (demo)") },
      ],
    },
  ],
});

const code = `import { ItemRow } from "@/components/official/item/ItemRow";

<ItemRow
  label={conv.title}
  active={conv.id === activeId}
  onOpen={() => setActiveId(conv.id)}
  menu={() => buildRowMenu(conv)}              // lazy — built on open
  rename={{ value: conv.title, onCommit: (next) => rename(conv.id, next) }}
  trailing={conv.favorite ? <Star className="h-3 w-3 text-amber-500" fill="currentColor" /> : null}
/>

// menu entry with intent: "rename" drives the row's inline rename
{ id: "rename", label: "Rename", icon: Pencil, intent: "rename", onSelect: () => {} }`;

export default function ItemRowDisplay({ component }: ComponentDisplayProps) {
  const [items, setItems] = useState(INITIAL);
  const [activeId, setActiveId] = useState("a");

  if (!component) return null;

  const rename = (id: string, next: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title: next } : it)));
  const toggleFav = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, favorite: !it.favorite } : it)));

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="The standard list row. Labels run the full width and fade at the right edge — hover a row and watch the fade deepen to clear the kebab (no ellipsis). Double-click a row (or the kebab's Rename) to edit in place. Right-click for the same menu."
    >
      <div className="flex w-full flex-wrap justify-center gap-8 p-6">
        {/* Sidebar (md) */}
        <div className="w-72 rounded-lg border border-border bg-card p-1">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Today
          </div>
          {items.map((it) => (
            <ItemRow
              key={it.id}
              label={it.title}
              active={it.id === activeId}
              onOpen={() => setActiveId(it.id)}
              menu={() => rowMenu(it, !!it.favorite)}
              rename={{ value: it.title, onCommit: (next) => rename(it.id, next) }}
              trailing={
                it.streaming ? (
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                ) : it.favorite ? (
                  <button type="button" onClick={() => toggleFav(it.id)} aria-label="Toggle pin">
                    <Star className="h-3 w-3 text-amber-500" fill="currentColor" />
                  </button>
                ) : null
              }
            />
          ))}
        </div>

        {/* Tree (sm, indents) */}
        <div className="w-72 rounded-lg border border-border bg-card p-1">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Files — sizes & indent
          </div>
          <ItemRow size="sm" label="src" leading={<Folder className="h-3.5 w-3.5 text-muted-foreground" />} onOpen={() => {}} />
          <ItemRow size="sm" indent={1} label="components" leading={<Folder className="h-3.5 w-3.5 text-muted-foreground" />} onOpen={() => {}} />
          <ItemRow
            size="sm"
            indent={2}
            label="ItemRow.tsx is a fairly long filename that demonstrates the fade"
            leading={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
            onOpen={() => {}}
            menu={() => rowMenu({ id: "f", title: "ItemRow.tsx" }, false)}
          />
          <ItemRow size="lg" label="Large row variant" leading={<Hash className="h-4 w-4 text-muted-foreground" />} onOpen={() => {}} menu={() => rowMenu({ id: "g", title: "Large row" }, false)} />
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}
