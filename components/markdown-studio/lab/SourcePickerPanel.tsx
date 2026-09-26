// components/markdown-studio/lab/SourcePickerPanel.tsx
//
// The Markdown Studio "Open…" panel: pick a source kind (note, study guide,
// chat message, agent prompt, flashcard front/back, test sample), then a
// recent item — or paste an id. Loads are READ-ONLY copies into the studio.

"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  Inbox,
  Loader2,
  MessageSquare,
  PanelBottom,
  PanelTop,
  Search,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { cn } from "@/lib/utils";
import { RichContent } from "@/components/rich-content/RichContent";
import {
  STUDIO_SOURCES,
  STUDIO_SOURCE_KINDS,
  isUuid,
  listStudioSource,
  type StudioSourceKind,
  type StudioSourceListItem,
} from "./content-sources";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON, AGENT_ICON_NAME } from "@/components/icons/domain-icons";

const ICONS: Record<string, LucideIcon> = {
  FileText,
  StickyNote,
  GraduationCap,
  MessageSquare,
  // Keyed by the NAME the source declares ("Webhook"), never the constant's
  // identifier — a shorthand `AGENT_ICON,` key made the agent-prompt source
  // fall back to the sticky-note icon.
  [AGENT_ICON_NAME]: AGENT_ICON,
  PanelTop,
  PanelBottom,
  FlaskConical,
};

export interface SourcePickerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  initialKind?: StudioSourceKind;
  /** Called with the chosen kind + id; the host performs the load. */
  onPick: (kind: StudioSourceKind, id: string) => void;
}

export function SourcePickerPanel({
  open,
  onOpenChange,
  isAdmin,
  initialKind = "note",
  onPick,
}: SourcePickerPanelProps) {
  const [kind, setKind] = useState<StudioSourceKind>(initialKind);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<StudioSourceListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Which (kind, query) the current items/error answer. Until the answer for
  // the CURRENT request lands, the list is loading — never an empty state
  // that claims "you have none" for a list that was simply not fetched yet.
  const [listedKey, setListedKey] = useState<string | null>(null);

  const kinds = STUDIO_SOURCE_KINDS.filter(
    (k) => isAdmin || !STUDIO_SOURCES[k].adminOnly,
  );
  const def = STUDIO_SOURCES[kind];
  const pastedId = search.trim();
  const canOpenPasted = isUuid(pastedId);
  const query = canOpenPasted ? "" : search;
  const requestKey = `${kind}\u0000${query}`;
  const loading = listedKey !== requestKey;

  // Fetch the recent list for the chosen kind (debounced on search).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(
      () => {
        listStudioSource(kind, query)
          .then((rows) => {
            if (cancelled) return;
            setItems(rows);
            setError(null);
            setListedKey(requestKey);
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setItems([]);
            setError(err instanceof Error ? err.message : String(err));
            setListedKey(requestKey);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, kind, query, requestKey, search]);

  const pick = (id: string) => {
    onPick(kind, id);
    onOpenChange(false);
  };

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          Open real content
        </span>
      }
      description="Load a read-only copy of a real record. Editing here never changes the original."
      position="left"
      defaultSize={38}
      contentClassName="matrx-touch-targets flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="flex flex-wrap gap-1 border-b border-border px-4 py-3">
        {kinds.map((k) => {
          const Icon = ICONS[STUDIO_SOURCES[k].icon] ?? StickyNote;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setItems([]);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                k === kind
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {STUDIO_SOURCES[k].label}
            </button>
          );
        })}
      </div>
      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search recent ${def.label.toLowerCase()}s or paste an id`}
            className="h-8 pl-8 text-base"
            autoFocus
          />
        </div>
        {canOpenPasted && (
          <Button
            size="sm"
            className="h-7 w-full text-xs"
            onClick={() => pick(pastedId)}
          >
            Open {def.label.toLowerCase()} {pastedId.slice(0, 8)}…
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading recent {def.label.toLowerCase()}s…
            </div>
          )}
          {!loading && error && (
            <p className="px-2 py-4 text-xs text-destructive">
              {error} Paste an id above to open one directly.
              <ErrorAlchemyMenu />
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground">
              <Inbox className="h-5 w-5" />
              {search
                ? `No recent ${def.label.toLowerCase()}s match. Paste an id to open one directly.`
                : `You have no ${def.label.toLowerCase()}s yet.`}
            </div>
          )}
          {!loading &&
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item.id)}
                className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <div className="line-clamp-1 text-sm font-medium">
                  {item.rich ? (
                    <RichContent source={item.label} level="inline" />
                  ) : (
                    item.label
                  )}
                </div>
                {item.sublabel && (
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {item.rich ? (
                      <RichContent source={item.sublabel} level="inline" />
                    ) : (
                      item.sublabel
                    )}
                  </div>
                )}
              </button>
            ))}
        </div>
      </ScrollArea>
    </MatrxDynamicPanelHost>
  );
}
