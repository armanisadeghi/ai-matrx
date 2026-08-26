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
 *
 * THE DOOR LAW applies twice here, and generically both times:
 *
 *   - The RECORD itself. `itemType` is a canonical entity token (the
 *     `KnownItemType` union is the token vocabulary, and `doors.ts` already
 *     maps the two that differ in the peek catalogue), so the title bar
 *     resolves its own doors. The id chip used to be copy-only: a window that
 *     shows you a record's full uuid and offers no way to open it is the
 *     purest form of the dead end this sweep exists to remove.
 *   - Its RELATIONSHIPS. Every `<token>_id` column in the fetched row goes
 *     through `tokenFromColumnName` → `MatrxUuidCell`, so `project_id` /
 *     `agent_id` / `conversation_id` become openable instead of printing as
 *     bare uuids. This is deliberately generic: it costs nothing per entity
 *     and every type this window can ever show gains it at once. Columns that
 *     resolve to no token keep rendering as plain text — a wrong link is worse
 *     than no link, which is exactly why `tokenFromColumnName` is strict.
 */

"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Braces, Check, Copy, Loader2 } from "lucide-react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  isUuidValue,
  tokenFromColumnName,
} from "@/components/official/entity-ref/doors";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  createItemDetailScope,
  ITEM_DETAIL_SURFACE_NAME,
} from "@/features/surfaces/manifests/item-detail.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  entityTokenForItemType,
  getItemConfig,
} from "@/features/item-presentation/registry";
import type { ItemType } from "@/features/item-presentation/types";
import { isEntityTypeToken } from "@/types/generated/entity-types.generated";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";

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
  // NOT `itemType` verbatim — a few item types are spelled differently in the
  // entity registry (`table` → `dataset`, `document` → `udt_document`,
  // `picklist` → `structured_list`), and passing the raw type silently costs
  // those records their route and peek.
  const doorToken = entityTokenForItemType(itemType);
  const Icon = config.icon;
  const detailSource = recognized ? config.detailSource : undefined;

  const [status, setStatus] = useState<LoadStatus>("idle");
  const [row, setRow] = useState<Row | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!detailSource || !itemId) {
      setStatus("none");
      return undefined;
    }
    let cancelled = false;
    setStatus("loading");
    setRow(null);

    // MATRX-EXCEPTION: dynamic table name → use the UNtyped generic client
    // (same as the registry's fetchRow, which takes a plain `SupabaseClient`
    // param). The typed `SupabaseClient<Database>` rejects `.from(string)`
    // and blows the instantiation depth resolving the full schema union.
    // This window is the deliberate generic fallback for arbitrary item
    // types — there is no single table/row shape to type against.
    const baseDb = supabase as unknown as SupabaseClient;
    const db = detailSource.schemaName
      ? baseDb.schema(detailSource.schemaName)
      : baseDb;
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
      // MATRX-EXCEPTION: `data` is the untyped generic client's result for a
      // runtime-determined table (see baseDb above) — genuinely no static
      // row shape exists to guard against.
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

  const fields: {
    key: string;
    value: { text: string; mono?: boolean };
    /** Set when this column is an FK we can actually open. */
    fkToken: string | null;
  }[] = row
    ? Object.entries(row)
        .filter(([k]) => !HIDDEN_FIELDS.has(k))
        .map(([k, v]) => ({
          key: k,
          value: formatValue(v),
          // Only a real uuid VALUE earns a door — a `<token>_id` column holding
          // a slug or a business key would send the resolver looking for a row
          // that isn't there.
          fkToken: isUuidValue(v) ? tokenFromColumnName(k) : null,
        }))
        .filter(
          (
            f,
          ): f is {
            key: string;
            value: { text: string; mono?: boolean };
            fkToken: string | null;
          } => f.value !== null,
        )
    : [];

  // ── The dossier as readable text ────────────────────────────────────────
  //
  // This window is a DOCUMENT ABOUT A RECORD, so Copy-for-AI / Export /
  // Download-as-Markdown want the thing the user is looking at, in the same
  // order they are looking at it. Built generically from what the panel
  // already rendered — never per-type, because the whole point of this window
  // is that it shows an arbitrary entity.
  const recordFields: Record<string, string> = {};
  for (const field of fields)
    recordFields[titleizeKey(field.key)] = field.value.text;

  const dossierLines: string[] = [
    `# ${displayTitle}`,
    `Type: ${config.label}`,
    ...(itemId ? [`ID: ${itemId}`] : []),
    ...(initialAbout?.trim() ? ["", initialAbout.trim()] : []),
    ...(fields.length > 0
      ? ["", ...fields.map((f) => `${titleizeKey(f.key)}: ${f.value.text}`)]
      : []),
  ];
  const dossierText = dossierLines.join("\n");

  // Live surface scope — read at menu-open / agent-launch time from state the
  // window already holds (never fetches). The window IS a surface: agents
  // bound to `matrx-user/item-detail` get the dossier, not a bare uuid.
  const getScope = () =>
    createItemDetailScope({
      item_type: itemType ?? "unknown",
      item_label: config.label,
      item_title: displayTitle,
      record_status: status === "idle" ? "loading" : status,
      field_count: fields.length,
      content: dossierText,
      item_id: itemId ?? undefined,
      item_about: initialAbout?.trim() || undefined,
      record_fields: fields.length > 0 ? recordFields : undefined,
    });

  // Surface-specific items only — Copy / Copy-as / Export / Download as
  // Markdown / AI already come from the core menu acting on `dossierText`.
  // This is the one shape a generic record dossier has that plain text
  // doesn't: its raw field map.
  const recordSection: ContextMenuExtraSection = {
    id: "item-detail-record",
    label: "Record",
    icon: Braces,
    items: [
      {
        kind: "item",
        id: "item-detail-copy-id",
        label: "Copy record ID",
        icon: Copy,
        disabled: !itemId,
        onSelect: () => {
          if (!itemId) return;
          void copyToClipboard(itemId, {
            formatJson: false,
            onSuccess: () => toast.success("Record ID copied"),
            onError: () => toast.error("Could not copy record ID"),
          });
        },
      },
      {
        kind: "item",
        id: "item-detail-copy-fields-json",
        label: "Copy fields as JSON",
        icon: Braces,
        disabled: fields.length === 0,
        onSelect: () => {
          void copyToClipboard(JSON.stringify(recordFields, null, 2), {
            formatJson: false,
            onSuccess: () => toast.success("Fields copied"),
            onError: () => toast.error("Could not copy fields"),
          });
        },
      },
    ],
  };

  const handleCopyId = () => {
    if (!itemId) return;
    void navigator.clipboard?.writeText(itemId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ITEM_DETAIL_SURFACE_NAME}
      isEditable={false}
      getScope={getScope}
    >
      <WindowPanel
        id="item-detail-window"
        overlayId="itemDetailWindow"
        titleNode={
          <div className="flex items-center gap-2 min-w-0">
            <Icon className={cn("h-4 w-4 shrink-0", config.accent.text)} />
            <span className="truncate text-sm font-medium">{displayTitle}</span>
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
        }
        actionsRight={
          itemId ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground transition-colors hover:text-foreground"
                title="Copy ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span className="max-w-[160px] truncate">{itemId}</span>
              </button>
              {/* The record's own doors. Controls render as a SIBLING of the copy
                button, never inside it — and `EntityDoorControls` renders no
                chrome at all when the token has neither route nor peek, so an
                unrecognized item type simply keeps the copy chip it had. */}
              {doorToken ? (
                <EntityDoorControls
                  token={doorToken}
                  id={itemId}
                  name={displayTitle}
                  alwaysShowActions
                />
              ) : null}
            </div>
          ) : undefined
        }
        onClose={onClose}
        width={520}
        height={600}
        minWidth={360}
        minHeight={320}
        bodyClassName="overflow-y-auto"
      >
        {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without this,
          a right-click inside the floating dossier is answered by whatever page
          happens to be underneath — handing the user THAT page's surface,
          values and agents while they look at this record. Verified live
          2026-08-24: right-click here produced nothing at all, so the generic
          peek target of THE DOOR LAW could not even be copied for an AI. */}
        <NonEditableContextMenu
          sourceFeature="system"
          surfaceName={ITEM_DETAIL_SURFACE_NAME}
          contentSource={{ type: "raw" }}
          // Attach To / Share need a REGISTERED entity token — `doorToken`
          // already normalises the item types whose token differs, and an
          // unrecognized type simply gets a content-only menu rather than a
          // wrong association edge.
          {...(itemId && doorToken && isEntityTypeToken(doorToken)
            ? {
                entity: {
                  type: doorToken,
                  id: itemId,
                  title: displayTitle,
                },
              }
            : {})}
          getApplicationScope={getScope}
          extraSections={[recordSection]}
        >
          {/* `min-h-full` so the menu answers a right-click anywhere in the
              window, not only on the rows — a short dossier otherwise leaves a
              dead band of body below it where the page underneath answers. */}
          <div className="flex min-h-full flex-col">
            {/* About — agent-provided description (content, can run multi-line). */}
            {initialAbout?.trim() && (
              <p className="border-b border-border/60 p-4 text-xs leading-snug text-muted-foreground line-clamp-3">
                {initialAbout.trim()}
              </p>
            )}

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
                  <Icon
                    className={cn("h-7 w-7 opacity-30", config.accent.text)}
                  />
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
                  {fields.map(({ key, value, fkToken }) => (
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
                          !fkToken &&
                            value.mono &&
                            "whitespace-pre-wrap rounded-md bg-muted px-2 py-1 font-mono text-xs",
                        )}
                      >
                        {fkToken ? (
                          <MatrxUuidCell
                            value={value.text}
                            label={titleizeKey(key)}
                            token={fkToken}
                          />
                        ) : (
                          value.text
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </NonEditableContextMenu>
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}
