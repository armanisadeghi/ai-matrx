"use client";

/**
 * Kind Directives — the FE renderer registry, and THE PREFIX TIER.
 *
 * One identity, one lookup. A directive IS a kind instance
 * (`{"__kind":"directive_v1_<class>_<noun>","items":[…]}`), so the renderer for
 * one is resolved from its SLUG, in the same shape the kind component resolver
 * uses:
 *
 *   getDirectiveRenderer(slug)
 *     → an exact-slug renderer            (directive_v1_action_plan_tree)
 *     → else the CLASS prefix rule        (every directive_v1_reference_* )
 *     → else null — the graceful floor    (EnvelopeFallbackCard)
 *
 * THE PREFIX RULE is the point, and it is Arman's routing-language ruling made
 * real: registering `reference` once gives EVERY enrolled noun a live chip
 * renderer for free, and a custom renderer for one slug overrides it. 419
 * catalogued nouns do not need 419 registrations, and a brand-new server noun
 * renders with ZERO frontend edits.
 *
 * A null result is the graceful-fallback signal — `MatrxEnvelopeBlock` shows the
 * neutral card so an unknown shape is still displayed, never dropped.
 *
 * Add a renderer = one `registerDirectiveRenderer(...)` call. No switch to edit.
 * Spec: docs/protocol/KIND_DIRECTIVES.md (renderer registry + class prefix tier).
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
import type { DecodedDirective } from "@/features/content-ir/directives/decode";
import {
  type DirectiveClass,
  buildDirectiveSlug,
} from "@/features/content-ir/directives/grammar";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import {
  coerceRefToStrings,
  getReferenceResolver,
  referenceChipLabel,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
// Directive renderers load as their own chunks, on first render of a matching
// envelope. This registry is statically reachable from ~109 route entries (via
// MatrxEnvelopeBlock's importers), so a static renderer import here multiplies
// the renderer's whole graph — framer-motion included — across all of them.
// Method B (`code-splitting` skill): id → chunk; never a static value import.
import dynamic from "next/dynamic";

const CreateProjectWithTasksRenderer = dynamic(
  () =>
    import(
      "@/features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer"
    ),
  { ssr: false, loading: () => null },
);
const PlanTreeRenderer = dynamic(
  () => import("@/features/matrx-envelope/directives/planTree/PlanTreeRenderer"),
  { ssr: false, loading: () => null },
);
const PlanNodePatchRenderer = dynamic(
  () =>
    import("@/features/matrx-envelope/directives/planTree/PlanNodePatchRenderer"),
  { ssr: false, loading: () => null },
);

export interface DirectiveRendererProps {
  /** The decoded two-key shell — slug, class, noun, items, position law. */
  directive: DecodedDirective;
}

export type DirectiveRenderer = ComponentType<DirectiveRendererProps>;

/** Exact-slug renderers. */
const _bySlug = new Map<string, DirectiveRenderer>();
/** THE PREFIX TIER: one renderer for a whole class. */
const _byClass = new Map<DirectiveClass, DirectiveRenderer>();

/**
 * Register a renderer for a whole CLASS (the prefix rule — every
 * `directive_v1_<class>_*` renders through it), or for one exact `(class, noun)`
 * pair, which wins.
 *
 * `noun` is passed as a noun, never as a hand-typed slug: the slug is BUILT by
 * the grammar, so a registration whose slug could not be parsed back is
 * unconstructable rather than silently unreachable.
 */
export function registerDirectiveRenderer(
  directiveClass: DirectiveClass,
  renderer: DirectiveRenderer,
  noun?: string,
): void {
  if (noun) _bySlug.set(buildDirectiveSlug(directiveClass, noun), renderer);
  else _byClass.set(directiveClass, renderer);
}

/** The renderer for a slug: exact → class prefix rule → null (the floor). */
export function getDirectiveRenderer(
  directive: Pick<DecodedDirective, "slug" | "directiveClass">,
): DirectiveRenderer | null {
  return (
    _bySlug.get(directive.slug) ?? _byClass.get(directive.directiveClass) ?? null
  );
}

// ── Built-in renderers ───────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-reference-type chip icon. Falls back to a generic link glyph. */
function chipIcon(type: string): ComponentType<{ className?: string }> {
  switch (type) {
    case "structured_list":
    case "picklist": // legacy read-only
      return List;
    case "structured_list_group":
    case "structured_list_item":
    case "picklist_group": // legacy read-only
    case "picklist_item": // legacy read-only
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
  // A chip is a NAME: record resolvers return "heading\nbody" — print the
  // heading, keep the whole value for the tooltip.
  const label = referenceChipLabel(display);

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
      open(openType, openId, { name: label });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canOpen}
      title={isExternalUrl ? ref.url : canOpen ? `Open ${openType}` : label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border",
        "bg-muted px-2 py-0.5 text-sm text-foreground align-middle min-w-0 max-w-full",
        canOpen
          ? "cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
          : "cursor-default",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
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
const ReferenceRenderer: DirectiveRenderer = ({ directive }) => {
  const items = directive.items as unknown as ReferenceItem[];
  return (
    <span className="my-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
      {items.map((item, i) => (
        <ReferenceChip
          key={`${directive.noun}:${JSON.stringify(item) ?? i}`}
          item={item}
          type={directive.noun}
        />
      ))}
    </span>
  );
};

// THE PREFIX RULE. One registration covers every `directive_v1_reference_*`
// slug the server can mint — the 419-noun catalog included — because the noun
// IS the chip's reference type and the chip resolves it live. A noun that needs
// something richer than a chip registers itself by name below and wins.
registerDirectiveRenderer("reference", ReferenceRenderer);

// A Kind Action, not a create-class noun: the server registers it via
// `register_action("create_project_with_tasks")`, so its canonical slug is
// `directive_v1_action_create_project_with_tasks` — and the legacy shim maps
// the stored `output_directive:create_project_with_tasks` onto the same one.
registerDirectiveRenderer(
  "action",
  CreateProjectWithTasksRenderer,
  "create_project_with_tasks",
);

/**
 * `directive_v1_action_context_groom` — the inline groom fence an agent emits
 * in its own prose. Position decides capability: in content it is a
 * RECEIPT, never executed (the server's turn_directive_handler already acted
 * on it). Render a quiet one-line indicator, never prose/code — the model's
 * view was compacted; the user-facing transcript is unchanged. Contract:
 * aidream services/conversation_values/FEATURE.md (Grooming) +
 * docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md §4.
 */
const ContextGroomRenderer: DirectiveRenderer = ({ directive }) => {
  const count = directive.items.length;
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

registerDirectiveRenderer("action", ContextGroomRenderer, "context_groom");

// Content Planning (plan schema) — applied server-side by aidream's
// services/content_plan directives; these cards are receipts that resolve to
// live plan.node routes and deep-link into /content-plan. Both arrived under
// two encodings before the merge (`output_directive:` and `function:`); the
// merge gave them ONE identity — class `action` — so there is one registration
// each, not two. An unregistered action falls to EnvelopeFallbackCard, whose
// Apply button posts /directives/confirm: a brand-new server action renders and
// applies with ZERO frontend edits.
registerDirectiveRenderer("action", PlanTreeRenderer, "plan_tree");
registerDirectiveRenderer("action", PlanNodePatchRenderer, "plan_node_patch");
