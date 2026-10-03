/**
 * The canvas CONTENT vocabulary: every artifact/surface type the canvas can
 * show, which of them can be saved as an artifact, and the title helpers.
 *
 * Framework-light on purpose: openers import this without pulling in a single
 * renderer. Each content type is registered as its own `@ai-matrx/canvas` kind
 * (features/canvas/host/artifactKinds.tsx).
 */

import { isValidElement, type ReactNode } from "react";

// Supported canvas content types
export type CanvasContentType =
  | "quiz"
  | "presentation"
  | "iframe"
  | "html"
  | "code"
  | "image"
  | "diagram"
  | "comparison"
  | "timeline"
  | "research"
  | "troubleshooting"
  | "decision-tree"
  | "flashcards"
  | "recipe"
  | "resources"
  | "code_preview"
  | "code_edit_error"
  | "progress"
  | "math_problem"
  | "mermaid"
  | "svg"
  | "chart"
  | "map"
  | "stats"
  | "diff"
  | "questionnaire"
  | "react"
  | "table"
  | "transcript"
  | "structured_info"
  | "tree"
  | "tasks"
  // Live Cloud Browser surface hosted in the canvas pane. `data` is a pointer
  // `{ initialProfileId?, runId? }`; the body holds live run/screenshot/handoff
  // state (never serializable) — NON_PERSISTABLE, like the editor surfaces.
  | "cloud_browser"
  // A CLOUD DOCUMENT (`workbench.udt_documents`) hosted in the canvas pane.
  // `data` is a pointer `{ documentId }`; the body mounts the canonical
  // `DocumentEditor` — the very component `/documents/[id]` mounts — so the
  // canvas hosts the document rather than being a second editor for it.
  //
  // This type is the DOOR the 2026-09-14 production defect was missing: the
  // `document` tool created a row, the agent announced "Created and opened as
  // a document artifact", and nothing could open because the canvas had no
  // type that could host a `udt_document`.
  | "udt_document"
  // Live SANDBOX surface hosted in the canvas pane — Terminal / Files /
  // Activity for the box bound to a conversation. `data` is a pointer
  // `{ sandboxRowId, fallbackName? }`; the body holds a live pty and a live
  // file tree, so there is nothing serializable — NON_PERSISTABLE, like the
  // Cloud Browser. It shares the canvas region with the browser, documents
  // and artifacts and NEVER owns it (the champions — Claude Code, Codex,
  // Cursor — all show the terminal on demand in one shared side region).
  | "sandbox"
  // A TOPICAL MAP hosted in the canvas pane (Lane G, R12). `data` is a pointer
  // `{ mapId, screen, siteId }`; the body mounts the canonical
  // `TopicalMapWorkspaceBody` in `host="canvas"` — the same component the
  // page route and the floating window render — which reads the live map from
  // the store and the `seo.*` functions. The map's truth is its rows, so a
  // `canvas_items` copy would be a stale second map: NON_PERSISTABLE, never an
  // artifact type.
  //
  // A conversation's documents and the scratchpad are NOT content types: each
  // is one tool tab (`conversation-documents`, `global-scratchpad` —
  // `@ai-matrx/chat/host/canvas-tabs`), never an artifact.
  | "topical_map"
  // A KIND VALUE drawn by its kind (KINDS-GLUE wave 3 §5.5). `data` is the value itself
  // (`{"__kind": …}`), handed to the one kind front door — so a record of a Table opens here as
  // the SAME card it draws in a chat or a note. Never a second renderer.
  | "kind_value";

/**
 * Canvas content types that hold live, non-serializable runtime state —
 * callbacks like `onApply` / `onDiscard` / `onCloseModal`. They are ephemeral
 * editor surfaces, NOT artifacts. Persisting them serializes the callbacks to
 * `null` and produces a corrupt, dead row that renders with no handlers, so
 * saving them must be refused loudly rather than silently writing junk.
 */
export const NON_PERSISTABLE_CANVAS_TYPES: ReadonlySet<string> = new Set([
  "code_preview",
  "code_edit_error",
  // Live Cloud Browser: holds run/screenshot/controller/handoff state — a
  // canvas_items row would freeze a dead pointer with no live session.
  "cloud_browser",
  // Live sandbox: a pty and a file tree against a running box. A canvas_items
  // row would freeze a pointer to a box that is gone by the time it is read.
  "sandbox",
  // A cloud document owns its OWN append-only snapshot history
  // (`udt_document_snapshots`) and saves itself as the user types. A
  // `canvas_items` row would freeze a stale copy beside the live one, so the
  // pane is a pointer and only a pointer. Unlike the other live surfaces it
  // still HAS a real source — see `canvasSource.ts`.
  "udt_document",
  // A topical map pane is a pointer to live rows the workspace body reads; the
  // rows are the truth and a frozen copy would drift on the next accepted
  // proposal (see the type's comment above).
  "topical_map",
]);

export function isPersistableCanvasType(type: string): boolean {
  return !NON_PERSISTABLE_CANVAS_TYPES.has(type);
}

/** Admin-visible trace from ensureArtifactPersisted / cloud sync. */
export interface ArtifactDebugTrace {
  steps: string[];
  errors: string[];
  ensuredAt: number;
  wasCreated: boolean;
}

export interface CanvasContent {
  type: CanvasContentType;
  data: any; // Flexible data structure - each block handles its own data
  metadata?: {
    title?: string | ReactNode;
    subtitle?: string | ReactNode;
    sourceMessageId?: string;
    sourceTaskId?: string;
    /** Optional chat linkage for canvas views (e.g. flashcards). */
    conversationId?: string;
    messageId?: string;
    /** canvas_items row id when the open content is a persisted artifact —
     *  editors use it to save new versions instead of creating new rows. */
    canvasItemId?: string;
    /** Persisted artifact version when known (display chip). */
    artifactVersion?: number;
    /** Per-artifact mermaid render options + diagram identity. */
    mermaid?: Record<string, unknown>;
  };
}


/** Convert a possibly-ReactNode title to plain text for fallback uses. */
export function titleToString(
  title: string | ReactNode | undefined,
): string {
  if (!title) return "";
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  if (typeof title === "boolean") return String(title);
  if (Array.isArray(title)) {
    return title.map(titleToString).filter(Boolean).join(" ");
  }
  if (isValidElement(title)) {
    const children = (title.props as { children?: ReactNode })?.children;
    if (children) {
      const extracted = titleToString(children);
      if (extracted) return extracted;
    }
    return "Canvas Content";
  }
  return "Canvas Content";
}

/** Canonical fallback titles per type. */
export function getDefaultTitle(type: string): string {
  const titles: Record<string, string> = {
    quiz: "Quiz",
    presentation: "Presentation",
    iframe: "Web View",
    html: "HTML View",
    code: "Code Viewer",
    image: "Image",
    diagram: "Diagram",
    comparison: "Comparison",
    timeline: "Timeline",
    research: "Research",
    troubleshooting: "Troubleshooting",
    "decision-tree": "Decision Tree",
    flashcards: "Flashcards",
    recipe: "Recipe",
    resources: "Resources",
    progress: "Progress Tracker",
    math_problem: "Math Problem",
    mermaid: "Diagram",
    code_preview: "Code Preview",
    code_edit_error: "Code Edit Error",
    cloud_browser: "Cloud Browser",
    sandbox: "Sandbox",
    udt_document: "Document",
    topical_map: "Topical map",
  };
  return titles[type] || "Canvas View";
}

/**
 * The display label for a stored canvas type, for badges and filters. Known
 * types read their canvas title; anything else is humanized from its key
 * (`structured_info` → "Structured info"), never shown raw.
 */
export function getCanvasTypeLabel(type: string): string {
  const title = getDefaultTitle(type);
  if (title !== "Canvas View") return title;
  const words = type.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return "Canvas";
  const sentence = words.join(" ").toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Short subtitle per type — surfaces as the kind-of-thing label. */
export function getSubtitle(type: string): string | undefined {
  const subtitles: Record<string, string> = {
    quiz: "Interactive quiz",
    presentation: "Slideshow presentation",
    code: "Code snippet",
    diagram: "Interactive diagram",
    mermaid: "Editable diagram",
    math_problem: "Step-by-step solution",
  };
  return subtitles[type];
}

