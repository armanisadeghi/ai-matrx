/**
 * THE LEGACY-SURFACE REGISTRY — the one data file for the Rich Content
 * Unification switch-over (common-docs/projects/rich-content-unification/PLAN.md §7).
 *
 * Every legacy renderer, editor, menu, helper and raw-render pattern that the
 * cutover must retire is ONE row here. `inventory.ts` resolves each row over the
 * real import graph (TypeScript compiler API — aliases and re-exports followed),
 * emits INVENTORY.md + inventory.json, and guards the `banned` rows with a
 * shrink-only baseline.
 *
 * status:
 *   banned  — no NEW importer/definition may appear; existing ones are the
 *             baseline, which may only shrink (`pnpm check:rich-content-legacy`).
 *   tracked — current canonical entry points that the unified `<RichContent>`
 *             will absorb; inventoried, not guarded yet.
 *   review  — heuristic findings (raw HTML, raw content-field renders); each is
 *             a question for the cutover, not a verdict.
 *
 * Adding a row: pick the narrowest matcher; `module` files are repo-relative
 * paths WITH extension; `symbol` names match any top-level declaration of that
 * name (exported or not) plus every import that resolves to one.
 */

export type PieceStatus = "banned" | "tracked" | "review";

export type PieceCategory =
  | "markdown-package"
  | "legacy-editor"
  | "legacy-actions"
  | "prompt-editor"
  | "hand-rolled-helper"
  | "hand-rolled-textarea"
  | "renderer-entry-point"
  | "raw-html"
  | "raw-content-render"
  | "document-generator";

export type HeuristicRule = "raw-field-render" | "split-newline-paragraphs" | "pre-wrap-field";

export type PieceMatcher =
  /** Bare package specifier matched by regex source (anchored by the author). */
  | { kind: "package"; pattern: string }
  /** Repo files; any import resolving to one (directly or through a barrel). */
  | { kind: "module"; files: string[] }
  /** Top-level declarations of these names anywhere, plus their importers. */
  | { kind: "symbol"; names: string[] }
  /** A JSX attribute by name. */
  | { kind: "jsx-attribute"; name: string }
  /** An AST heuristic over .tsx/.jsx files. */
  | { kind: "heuristic"; rule: HeuristicRule };

export interface LegacyPiece {
  id: string;
  label: string;
  category: PieceCategory;
  status: PieceStatus;
  matcher: PieceMatcher;
  /** Files where this piece is lawful (the one core edge, the piece itself). */
  allowedFiles?: string[];
  /** Printed by the guard on a NEW site — the canonical replacement. */
  replacement: string;
}

const CORE_EDGE = "components/markdown-core/MarkdownCoreImpl.tsx";
/** The one core's other lawful homes: the shared preset table and its server twin (RC-B2b). */
const CORE_FILES = [
  CORE_EDGE,
  "components/markdown-core/markdown-core-presets.ts",
  "components/markdown-core/MarkdownCoreServer.tsx",
];

const RENDER_VIA_CORE =
  "Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` " +
  "(components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). " +
  "Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly.";

const ONE_EDITOR =
  "THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. " +
  "Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one.";

const ONE_ACTION_REGISTRY =
  "Register the action in the ONE action registry: features/rich-document/actions/registry.ts " +
  "(rich-content-unification PLAN §3.10). The chat registry and both AssistantActionBar copies are being deleted.";

const PROMPT_EDITOR =
  "The one editor's CodeMirror 6 source mode with {{variable}} highlighting (rich-content-unification PLAN §3.5). " +
  "Do not extend the hand-rolled contentEditable prompt pieces.";

const ONE_DOCUMENT_EXPORTER =
  "THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, \"docx\" | \"pdf\" | " +
  "\"epub\" | \"html\" | \"markdown\")` — one parsed tree, native Word with sections/TOC/captions/page numbers. " +
  "Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here.";

const docGen = (id: string, label: string, pattern: string): LegacyPiece => ({
  id,
  label,
  category: "document-generator",
  status: "banned",
  matcher: { kind: "package", pattern },
  replacement: ONE_DOCUMENT_EXPORTER,
});

const md = (id: string, label: string, pattern: string): LegacyPiece => ({
  id,
  label,
  category: "markdown-package",
  status: "banned",
  matcher: { kind: "package", pattern },
  allowedFiles: CORE_FILES,
  replacement: RENDER_VIA_CORE,
});

const entry = (id: string, file: string): LegacyPiece => ({
  id,
  label: id,
  category: "renderer-entry-point",
  status: "tracked",
  matcher: { kind: "module", files: [file] },
  replacement:
    "Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1).",
});

export const LEGACY_PIECES: LegacyPiece[] = [
  // ── Direct markdown/math package imports outside the one core edge ──────────
  md("pkg:react-markdown", "react-markdown", "^react-markdown(/|$)"),
  md("pkg:remark", "remark-* plugins", "^remark(-|/|$)"),
  md("pkg:rehype", "rehype-* plugins", "^rehype(-|/|$)"),
  md("pkg:katex", "katex (direct)", "^katex(/|$)"),
  md("pkg:react-katex", "react-katex", "^react-katex(/|$)"),
  {
    ...md("pkg:marked", "marked", "^marked(/|$)"),
    // The one editor's parse edge: `marked`'s LEXER as a byte-mapped tokenizer for the
    // visual mode's fidelity gate (rich-content PLAN §3.6). It renders nothing.
    allowedFiles: [...CORE_FILES, "components/rich-editor/core/markdown-parse.ts"],
  },
  md("pkg:markdown-it", "markdown-it", "^markdown-it(-|/|$)"),

  // ── A second Word / EPUB generator in the app (RC-B10 one-canonical) ──────
  docGen("pkg:docx", "docx (direct Word generator)", "^docx(/|$)"),
  docGen("pkg:html-docx", "html-docx-js / html-to-docx (HTML→Word)", "^(html-docx-js|html-to-docx)(/|$)"),
  docGen("pkg:docxtemplater", "docxtemplater / pizzip", "^(docxtemplater|pizzip)(/|$)"),
  docGen("pkg:epub-gen", "epub-gen / epub generators", "^(epub-gen|epub-gen-memory|@lesjoursfr/html-to-epub)(/|$)"),
  {
    id: "hand-rolled:docx",
    label: "hand-rolled DOCX builder (buildDocxFromHtml / altChunk)",
    category: "document-generator",
    status: "banned",
    matcher: { kind: "symbol", names: ["buildDocxFromHtml", "buildDocx", "htmlToDocx", "markdownToDocx"] },
    replacement: ONE_DOCUMENT_EXPORTER,
  },

  {
    id: "hand-rolled:document-math",
    label: "app-side math conversion before the document exporter",
    category: "document-generator",
    status: "banned",
    matcher: { kind: "symbol", names: ["drawDisplayMath", "prepareDocumentMarkdown", "renderDisplayMath"] },
    replacement:
      "Hand the markdown to `@ai-matrx/print/document` as-is: it lifts math with the core's one dialect " +
      "(`@ai-matrx/content-ir/source`) and typesets it in every format (verify-RC-B10 F2).",
  },

  // ── Legacy editors ──────────────────────────────────────────────────────────
  {
    id: "pkg:toast-ui",
    label: "@toast-ui/* (Toast UI editor)",
    category: "legacy-editor",
    status: "banned",
    matcher: { kind: "package", pattern: "^@toast-ui/" },
    replacement: ONE_EDITOR,
  },
  {
    id: "TuiEditorContent",
    label: "TuiEditorContent",
    category: "legacy-editor",
    status: "banned",
    matcher: {
      kind: "module",
      files: ["components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx"],
    },
    replacement: ONE_EDITOR,
  },
  {
    id: "pkg:remirror",
    label: "@remirror/* (installed, unused)",
    category: "legacy-editor",
    status: "banned",
    matcher: { kind: "package", pattern: "^@remirror/" },
    replacement: ONE_EDITOR,
  },
  {
    id: "FullScreenMarkdownEditor",
    label: "FullScreenMarkdownEditor (16-tab editor)",
    category: "legacy-editor",
    status: "banned",
    matcher: {
      kind: "module",
      files: ["components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx"],
    },
    replacement: ONE_EDITOR,
  },
  {
    id: "BasicContentEditor",
    label: "BasicContentEditor (split editor)",
    category: "legacy-editor",
    status: "banned",
    matcher: { kind: "module", files: ["components/content-refine/BasicContentEditor.tsx"] },
    replacement: ONE_EDITOR,
  },
  {
    id: "official/ContentEditor",
    label: "components/official/content-editor/ContentEditor",
    category: "legacy-editor",
    status: "banned",
    matcher: { kind: "module", files: ["components/official/content-editor/ContentEditor.tsx"] },
    replacement: ONE_EDITOR,
  },

  // ── Legacy action menus ─────────────────────────────────────────────────────
  {
    id: "messageActionRegistry",
    label: "messageActionRegistry (chat, both copies)",
    category: "legacy-actions",
    status: "banned",
    matcher: {
      kind: "module",
      files: [
        "features/agents/components/messages-display/message-options/messageActionRegistry.ts",
        "features/cx-chat/actions/messageActionRegistry.ts",
      ],
    },
    replacement: ONE_ACTION_REGISTRY,
  },
  {
    id: "AssistantActionBar",
    label: "AssistantActionBar (both copies)",
    category: "legacy-actions",
    status: "banned",
    matcher: {
      kind: "module",
      files: [
        "features/agents/components/messages-display/assistant/AssistantActionBar.tsx",
        "features/cx-chat/components/messages/AssistantActionBar.tsx",
      ],
    },
    replacement: ONE_ACTION_REGISTRY,
  },

  // ── Prompt editor pieces ────────────────────────────────────────────────────
  {
    id: "prompt:HighlightedText",
    label: "HighlightedText (prompt {{var}} contentEditable)",
    category: "prompt-editor",
    status: "banned",
    matcher: {
      kind: "module",
      files: ["features/agents/components/variables-management/HighlightedText.tsx"],
    },
    replacement: PROMPT_EDITOR,
  },
  {
    id: "prompt:MessageViewModeMenu",
    label: "MessageViewModeMenu (bespoke mode toggle)",
    category: "prompt-editor",
    status: "banned",
    matcher: {
      kind: "module",
      files: ["features/agents/components/builder/message-builders/MessageViewModeMenu.tsx"],
    },
    replacement: PROMPT_EDITOR,
  },

  // ── Hand-rolled helpers ─────────────────────────────────────────────────────
  {
    id: "cleanMarkdownPreview",
    label: "cleanMarkdownPreview (regex markdown stripping)",
    category: "hand-rolled-helper",
    status: "banned",
    matcher: { kind: "symbol", names: ["cleanMarkdownPreview"] },
    replacement:
      "Render the preview at the inline level through the markdown core (`BasicMarkdownContent`; target " +
      "`<RichContent level=\"inline\">`, PLAN §3.1) instead of stripping markdown with regexes.",
  },
  {
    id: "renderAnnouncementMessage",
    label: "renderAnnouncementMessage (regex link parser)",
    category: "hand-rolled-helper",
    status: "banned",
    matcher: { kind: "symbol", names: ["renderAnnouncementMessage"] },
    replacement:
      "Render the message through the markdown core at the inline level: `<RichContent level=\"inline\">` " +
      "(PLAN §3.1).",
  },
  {
    // RC-B7 verify r2 (2026-09-25): table cells rendered through this regex
    // inline renderer, so the core's stream heal and math never reached them
    // (raw links / `$c_{1}$` in every chat table). Deleted; never again.
    id: "second-inline-renderer",
    label: "a second inline markdown renderer (InlineMarkdownWithLinks / applyInlineMarkdownHtmlFormatting)",
    category: "hand-rolled-helper",
    status: "banned",
    matcher: {
      kind: "symbol",
      names: ["InlineMarkdownWithLinks", "applyInlineMarkdownHtmlFormatting"],
    },
    replacement:
      "Render inline markdown (table cells, titles, labels) through the ONE core: " +
      "`<RichContent level=\"inline\" source isStreaming>` — math, links, code and the stream heal come with it.",
  },
  {
    id: "hand-rolled:AutoTextarea",
    label: "hand-rolled AutoTextarea / AutoResizeTextarea",
    category: "hand-rolled-textarea",
    status: "banned",
    matcher: { kind: "symbol", names: ["AutoTextarea", "AutoResizeTextarea"] },
    replacement:
      "Use `ProTextarea` (components/official/ProTextarea.tsx) — it auto-grows and carries dictation, cleanup " +
      "and agent actions. Never hand-roll another auto-resizing textarea.",
  },

  // ── Current renderer entry points (tracked, not banned yet) ────────────────
  entry("MarkdownStream", "components/MarkdownStream.tsx"),
  entry("BasicMarkdownContent", "components/mardown-display/chat-markdown/BasicMarkdownContent.tsx"),
  entry(
    "ConfigurableMarkdownContent",
    "components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx",
  ),
  entry("MarkdownRenderer", "components/mardown-display/MarkdownRenderer.tsx"),
  entry("CardFaceContent", "components/mardown-display/blocks/flashcards/CardFaceContent.tsx"),
  entry("RichDocument", "features/rich-document/RichDocument.tsx"),
  entry("MarkdownPreview", "features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx"),

  // ── Review: raw HTML and raw content-field renders ──────────────────────────
  {
    id: "dangerouslySetInnerHTML",
    label: "dangerouslySetInnerHTML",
    category: "raw-html",
    status: "review",
    matcher: { kind: "jsx-attribute", name: "dangerouslySetInnerHTML" },
    replacement:
      "Rich text renders through the markdown core; HTML-origin bodies go through the HTML-sanitizing path (PLAN §2).",
  },
  {
    id: "raw:field-in-text-element",
    label: "{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>",
    category: "raw-content-render",
    status: "review",
    matcher: { kind: "heuristic", rule: "raw-field-render" },
    replacement: "If the field can hold markdown, render it through the core at the right level (PLAN §3.1).",
  },
  {
    id: "raw:split-newline-paragraphs",
    label: '.split("\\n").map(→ JSX) paragraph renderer',
    category: "raw-content-render",
    status: "review",
    matcher: { kind: "heuristic", rule: "split-newline-paragraphs" },
    replacement: "Paragraphs come from the markdown core, never a hand split on newlines (PLAN §3.1).",
  },
  {
    id: "raw:pre-wrap-field",
    label: "whitespace-pre-wrap / pre-line on a content field",
    category: "raw-content-render",
    status: "review",
    matcher: { kind: "heuristic", rule: "pre-wrap-field" },
    replacement: "pre-wrap shows markdown source; render it through the core instead (PLAN §3.1).",
  },
];

/** Field names whose raw render is a review finding. */
export const CONTENT_FIELD_NAMES = [
  "content",
  "body",
  "description",
  "prompt",
  "reasoning",
  "transcript",
  "summary",
  "answer",
  "explanation",
  "instructions",
  "notes",
];
