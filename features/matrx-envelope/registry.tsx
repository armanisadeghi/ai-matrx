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
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import type {
  MatrxEnvelope,
  ReferenceItem,
} from "@/features/matrx-envelope/envelope";
import {
  coerceRefToStrings,
  getReferenceResolver,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import CreateProjectWithTasksRenderer from "@/features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer";

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
    case "app":
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
    case "studio_session":
      return Mic;
    case "workbook":
      return TableProperties;
    case "workbook_sheet":
      return TableProperties;
    case "document":
    case "udt_document":
      return FileText;
    case "document_page":
      return FileText;
    case "table_schema":
      return Columns3;
    case "file":
    case "media":
    case "file_page":
      return File;
    case "url":
      return Link2;
    default:
      return Link2;
  }
}

/**
 * One live reference chip. Its own component (a stable boundary) so it can use
 * hooks — the window-panel opener + the shared live-resolution hook. Always
 * shows SOMETHING (the item's display hint while loading / on miss).
 */
function ReferenceChip({ item, type }: { item: ReferenceItem; type: string }) {
  const open = useOpenItemPresentation();
  // The canonical item IS flat — identity ids live at the top level. Coerce the
  // whole item to string fields (resolvers read only the id keys they need).
  const ref = coerceRefToStrings(item, `${type} chip`);
  const resolver = getReferenceResolver(type);
  const { display, status } = useResolvedReferenceLabel(item, type);

  const Icon = chipIcon(type);

  // `url` has no Matrx-owned entity to open in a window panel — it opens the
  // link itself in a new tab, bypassing the item-presentation opener.
  const isExternalUrl = type === "url" && typeof ref.url === "string";
  const openId = resolver?.openId(ref);
  const openType = resolver?.openItemType;
  const canOpen =
    isExternalUrl || (!!openId && !!openType && UUID_RE.test(openId));

  const handleClick = () => {
    if (isExternalUrl) {
      window.open(ref.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (canOpen && openId && openType) {
      open(openType, openId, { name: display });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canOpen}
      title={isExternalUrl ? ref.url : canOpen ? `Open ${openType}` : display}
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

registerEnvelopeRenderer(
  "output_directive",
  CreateProjectWithTasksRenderer,
  "create_project_with_tasks",
);

/**
 * `output_directive:context_groom` — the inline groom fence an agent emits in
 * its own prose (`{"kind":"output_directive","type":"context_groom",
 * "items":[{"key":"…"}]}`). Position decides capability: in content it is a
 * RECEIPT, never executed (the server's turn_directive_handler already acted
 * on it). Render a quiet one-line indicator, never prose/code — the model's
 * view was compacted; the user-facing transcript is unchanged. Contract:
 * aidream services/conversation_values/FEATURE.md (Grooming) +
 * docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md §4.
 */
const ContextGroomRenderer: EnvelopeRenderer = ({ envelope }) => {
  const count = Array.isArray(envelope.items) ? envelope.items.length : 0;
  return (
    <span className="my-1 inline-flex items-center gap-1.5 align-middle text-xs text-muted-foreground">
      <Layers className="h-3 w-3 shrink-0" />
      <span>
        Context compacted
        {count > 0 ? ` · ${count} result${count === 1 ? "" : "s"} stubbed` : ""}
      </span>
    </span>
  );
};

registerEnvelopeRenderer("output_directive", ContextGroomRenderer, "context_groom");
