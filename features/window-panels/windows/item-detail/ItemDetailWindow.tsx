/**
 * features/window-panels/windows/item-detail/ItemDetailWindow.tsx
 *
 * Generic detail window for an `item_presentation` entity that doesn't (yet)
 * have a bespoke window. Given a `{ type, id }`, it:
 *
 *   1. Seeds instantly from the agent-provided name/about (no flash of empty).
 *   2. Fetches the full DB row via the type's `detailSource` (registry) and
 *      renders every populated scalar column, cleanly formatted.
 *   3. Stays graceful — un-enrichable types (no `detailSource`), missing rows,
 *      and RLS/network failures all render a calm message; nothing throws.
 *
 * This is the single fallback that closes the "no opener" gap for ALL item
 * types at once. As a type earns a richer bespoke window, flip its branch in
 * `useOpenItemPresentation` — nothing here changes.
 */

"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { getItemConfig } from "@/features/item-presentation/registry";
import type { ItemType } from "@/features/item-presentation/types";

export interface ItemDetailWindowProps {
  isOpen: boolean;
  onClose: () => void;
  itemType?: ItemType | null;
  itemId?: string | null;
  /** Agent-provided name, shown instantly until the row loads. */
  initialName?: string | null;
  /** Agent-provided one-liner, shown instantly until the row loads. */
  initialAbout?: string | null;
}

type LoadStatus = "idle" | "loading" | "ready" | "not-found" | "error" | "none";

type Row = Record<string, unknown>;

// Columns that are pure plumbing — hidden from the formatted field list.
const HIDDEN_FIELDS = new Set([
  "id",
  "user_id",
  "organization_id",
  "created_by",
  "updated_by",
  "embedding",
  "search_vector",
  "tsv",
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function titleizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): { text: string; mono?: boolean } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return { text: value ? "Yes" : "No" };
  if (typeof value === "number")
    return {
      text: Number.isFinite(value) ? value.toLocaleString() : String(value),
    };
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (ISO_RE.test(t)) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) {
        return {
          text: d.toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        };
      }
    }
    return { text: t };
  }
  // Objects / arrays → compact pretty JSON.
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json || json === "{}" || json === "[]") return null;
    return { text: json, mono: true };
  } catch {
    return { text: String(value), mono: true };
  }
}

export default function ItemDetailWindow({
  isOpen,
  onClose,
  itemType,
  itemId,
  initialName,
  initialAbout,
}: ItemDetailWindowProps) {
  if (!isOpen) return null;
  return (
    <ItemDetailWindowInner
      onClose={onClose}
      itemType={itemType ?? null}
      itemId={itemId ?? null}
      initialName={initialName ?? null}
      initialAbout={initialAbout ?? null}
    />
  );
}

function ItemDetailWindowInner({
  onClose,
  itemType,
  itemId,
  initialName,
  initialAbout,
}: {
  onClose: () => void;
  itemType: ItemType | null;
  itemId: string | null;
  initialName: string | null;
  initialAbout: string | null;
}) {
  const { config, recognized } = getItemConfig(itemType);
  const Icon = config.icon;
  const detailSource = recognized ? config.detailSource : undefined;

  const [status, setStatus] = useState<LoadStatus>("idle");
  const [row, setRow] = useState<Row | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!detailSource || !itemId) {
      setStatus("none");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setRow(null);

    // Dynamic table name → use the UNtyped generic client (same as the
    // registry's fetchRow, which takes a plain `SupabaseClient` param). The
    // typed `SupabaseClient<Database>` rejects `.from(string)` and blows the
    // instantiation depth resolving the full schema union.
    const db = supabase as unknown as SupabaseClient;
    const table: string = detailSource.table;
    const selectAll: string = "*";

    void (async () => {
      const { data, error } = await db
        .from(table)
        .select(selectAll)
        .eq("id", itemId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setStatus("error");
        return;
      }
      if (!data) {
        setStatus("not-found");
        return;
      }
      setRow(data as unknown as Row);
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [detailSource, itemId]);

  const titleField = detailSource?.titleField;
  const fetchedTitle =
    titleField && row && typeof row[titleField] === "string"
      ? (row[titleField] as string)
      : null;
  const displayTitle =
    fetchedTitle?.trim() || initialName?.trim() || `Untitled ${config.label}`;

  const fields: { key: string; value: { text: string; mono?: boolean } }[] = row
    ? Object.entries(row)
        .filter(([k]) => !HIDDEN_FIELDS.has(k))
        .map(([k, v]) => ({ key: k, value: formatValue(v) }))
        .filter(
          (f): f is { key: string; value: { text: string; mono?: boolean } } =>
            f.value !== null,
        )
    : [];

  const handleCopyId = () => {
    if (!itemId) return;
    void navigator.clipboard?.writeText(itemId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <WindowPanel
      id="item-detail-window"
      overlayId="itemDetailWindow"
      titleNode={
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", config.accent.text)} />
          <span className="truncate text-sm font-medium">{displayTitle}</span>
        </div>
      }
      onClose={onClose}
      width={520}
      height={600}
      minWidth={360}
      minHeight={320}
      bodyClassName="overflow-y-auto"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="relative flex items-start gap-3 border-b border-border/60 p-4">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              config.accent.bg,
              config.accent.ring,
            )}
          >
            <Icon className={cn("h-5 w-5", config.accent.text)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">
                {displayTitle}
              </h2>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
                  config.accent.bg,
                  config.accent.text,
                  config.accent.ring,
                )}
              >
                {config.label}
              </span>
            </div>
            {initialAbout?.trim() && (
              <p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-3">
                {initialAbout.trim()}
              </p>
            )}
            {itemId && (
              <button
                type="button"
                onClick={handleCopyId}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground transition-colors hover:text-foreground"
                title="Copy ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span className="max-w-[260px] truncate">{itemId}</span>
              </button>
            )}
          </div>
        </div>

        {/* Body states */}
        <div className="p-4">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading details…
            </div>
          )}

          {status === "not-found" && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertCircle className="h-6 w-6 text-amber-500" />
              <p className="text-sm text-muted-foreground">
                {`This ${config.label.toLowerCase()} couldn't be found — it may have been moved, deleted, or isn't shared with you.`}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {`Couldn't load the details for this ${config.label.toLowerCase()}.`}
              </p>
            </div>
          )}

          {status === "none" && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon className={cn("h-7 w-7 opacity-30", config.accent.text)} />
              <p className="text-sm text-muted-foreground">
                {initialAbout?.trim()
                  ? "No additional details are available for this item yet."
                  : `A ${config.label.toLowerCase()} reference. No additional details are available yet.`}
              </p>
            </div>
          )}

          {status === "ready" && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5">
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No additional fields to show.
                </p>
              )}
              {fields.map(({ key, value }) => (
                <div
                  key={key}
                  className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-b-0"
                >
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {titleizeKey(key)}
                  </dt>
                  <dd
                    className={cn(
                      "text-sm text-foreground break-words",
                      value.mono &&
                        "whitespace-pre-wrap rounded-md bg-muted px-2 py-1 font-mono text-xs",
                    )}
                  >
                    {value.text}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
