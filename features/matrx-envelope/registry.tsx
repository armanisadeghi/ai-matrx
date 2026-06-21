"use client";

/**
 * Matrx Envelope — FE renderer registry (the client mirror of the backend's
 * shape registry). Recognize the OUTER canonical envelope once, then route the
 * INTERNAL parts through this registry by `(kind, type)`:
 *
 *   getEnvelopeRenderer(kind, type)
 *     → a `kind:type`-specific renderer, else a `kind`-default renderer, else null
 *
 * A null result is the graceful-fallback signal — `MatrxEnvelopeBlock` shows a
 * neutral card so an unknown shape is still displayed, never dropped.
 *
 * Add a renderer = one `registerEnvelopeRenderer(...)` call. No switch to edit.
 */

import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Link2,
  List,
  ListChecks,
  Rows3,
  Columns3,
  Table,
  Table2,
  Loader2,
  CheckSquare,
  StickyNote,
  FolderKanban,
  Webhook,
  Mic,
  FileText,
  File,
  TableProperties,
  Building2,
  Layers,
  Tag,
  Box,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import type {
  MatrxEnvelope,
  ReferenceItem,
} from "@/features/matrx-envelope/envelope";
import {
  coerceRefToStrings,
  getReferenceResolver,
  referenceFallbackLabel,
} from "@/features/matrx-envelope/referenceResolvers";

export interface EnvelopeRendererProps {
  envelope: MatrxEnvelope;
}

export type EnvelopeRenderer = ComponentType<EnvelopeRendererProps>;

const _registry = new Map<string, EnvelopeRenderer>();

/** Register a renderer for a whole `kind`, or a specific `kind:type` (type wins). */
export function registerEnvelopeRenderer(
  kind: string,
  renderer: EnvelopeRenderer,
  type?: string,
): void {
  _registry.set(type ? `${kind}:${type}` : kind, renderer);
}

/** The renderer for `(kind, type)`: type-specific → kind-default → null (fallback). */
export function getEnvelopeRenderer(
  kind: string,
  type: string,
): EnvelopeRenderer | null {
  return _registry.get(`${kind}:${type}`) ?? _registry.get(kind) ?? null;
}

// ── Built-in renderers ───────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-reference-type chip icon. Falls back to a generic link glyph. */
function chipIcon(type: string): ComponentType<{ className?: string }> {
  switch (type) {
    case "picklist":
      return List;
    case "picklist_group":
      return ListChecks;
    case "picklist_item":
      return ListChecks;
    case "table":
      return Table;
    case "table_column":
      return Columns3;
    case "table_row":
      return Rows3;
    case "table_cell":
    case "dataset_cell":
      return Table2;
    case "task":
      return CheckSquare;
    case "note":
      return StickyNote;
    case "project":
      return FolderKanban;
    case "agent":
      return Webhook;
    case "agent_app":
      return Webhook;
    case "organization":
      return Building2;
    case "scope_type":
      return Layers;
    case "scope":
      return Tag;
    case "context_item":
      return Box;
    case "context_value":
      return Box;
    case "transcript":
      return Mic;
    case "transcript_segment":
      return Mic;
    case "session_transcript":
      return Mic;
    case "transcript_session":
      return Mic;
    case "workbook":
      return TableProperties;
    case "workbook_sheet":
      return TableProperties;
    case "document":
      return FileText;
    case "document_page":
      return FileText;
    case "table_schema":
      return Columns3;
    case "file":
    case "media":
    case "file_page":
      return File;
    default:
      return Link2;
  }
}

type ChipStatus = "idle" | "loading" | "ready" | "fallback";

/**
 * One live reference chip. Its own component (a stable boundary) so it can use
 * hooks — the LIVE-value fetch effect + the window-panel opener. Mirrors
 * `useEnrichItem`: keyed on the item ids, `cancelled` guard, soft-fail, never
 * throws. Always shows SOMETHING (the item's display hint while loading / on miss).
 */
function ReferenceChip({ item, type }: { item: ReferenceItem; type: string }) {
  const open = useOpenItemPresentation();
  // The canonical item IS flat — identity ids live at the top level. Coerce the
  // whole item to string fields (resolvers read only the id keys they need).
  const ref = coerceRefToStrings(item, `${type} chip`);
  const resolver = getReferenceResolver(type);
  const fallback = referenceFallbackLabel(item, type);

  const [value, setValue] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ChipStatus>("idle");
  const lastKey = useRef<string | null>(null);

  // Stable dependency key over the ref's values so the effect re-runs on change.
  const refKey = JSON.stringify(ref);

  useEffect(() => {
    if (!resolver) {
      setStatus("fallback");
      return;
    }
    const key = `${type}:${refKey}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    let cancelled = false;
    setStatus("loading");

    // Defend the "never throws" contract at the call site too — a synchronous
    // throw in a (future) resolver or getter degrades to fallback, never bubbles.
    Promise.resolve()
      .then(() => resolver.resolveValue(supabase, ref))
      .then((v) => {
        if (cancelled) return;
        if (typeof v === "string" && v.length > 0) {
          setValue(v);
          setStatus("ready");
        } else {
          setStatus("fallback");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Enhancement, not a requirement — degrade to display.label.
        setStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
    // refKey captures the ref contents; resolver is stable per type.
  }, [type, refKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = chipIcon(type);
  const display = status === "ready" && value ? value : fallback;

  const openId = resolver?.openId(ref);
  const openType = resolver?.openItemType;
  const canOpen = !!openId && !!openType && UUID_RE.test(openId);

  const handleClick = () => {
    if (canOpen && openId && openType) {
      open(openType, openId, { name: display });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canOpen}
      title={canOpen ? `Open ${openType}` : display}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border",
        "bg-muted px-2 py-0.5 text-sm text-foreground align-middle max-w-full",
        canOpen
          ? "cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
          : "cursor-default",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{display}</span>
      {status === "loading" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </button>
  );
}

/**
 * `reference` kind — one LIVE chip per item: fetches its authoritative value
 * from Supabase (graceful fallback to the item's display hints) and opens the
 * underlying entity in a window panel on click. Chips flow inline in prose.
 */
const ReferenceRenderer: EnvelopeRenderer = ({ envelope }) => {
  const items = Array.isArray(envelope.items)
    ? (envelope.items as unknown as ReferenceItem[])
    : [];
  return (
    <span className="my-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
      {items.map((item, i) => (
        <ReferenceChip
          key={`${envelope.type}:${JSON.stringify(item) ?? i}`}
          item={item}
          type={envelope.type}
        />
      ))}
    </span>
  );
};

registerEnvelopeRenderer("reference", ReferenceRenderer);
