"use client";

/**
 * PromptAssist — what the agent builder's system and user prompt boxes share:
 *
 *   - `usePromptInsertSources(agentId)` — the Insert menu's sources: the agent's
 *     own variables, its context items, and the Shape registry's kinds (loaded
 *     on first open; a kind inserts its JSON Schema with `__kind`).
 *   - `insertPromptText(...)` — puts an insert at the caret as exact text: the
 *     textarea's selection in Plain/Split, the Write editor's caret in Write.
 *   - `PromptWriteBox` — Write: the rich editor over the SAME stored text. It
 *     reports a change only when the person edits; an unedited open, a mode
 *     switch and a save leave the text byte-identical (rich-editor's prompt
 *     fidelity corpus guards this).
 *
 * Nothing here rewrites the prompt on its own. Corrections are suggestions in
 * PromptFixReview (rich-editor) and apply only on Apply.
 */

import { useRef, useState, type RefObject } from "react";
import RichEditor, { type RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { FormatButtons } from "@ai-matrx/rich-editor/format/FormatButtons";
import { textareaFormatTarget } from "@ai-matrx/rich-editor/format/format-target";
import { insertIntoText, type PromptInsert } from "@ai-matrx/rich-editor/core/prompt-inserts";
import type { PromptInsertKind, PromptInsertContextItem } from "@ai-matrx/rich-editor/format/PromptInsertMenu";
import { kindSchemaToJsonSchema } from "@ai-matrx/content-ir";
import {
  catalogResolver,
  listAllKinds,
  listCompiledKinds,
  type KindCatalogEntry,
} from "@/features/content-ir/registry/kind-catalog";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentContextPolicies,
  selectAgentVariableDefinitions,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";

export interface PromptInsertSources {
  variables: string[];
  kinds: PromptInsertKind[] | null;
  kindSchema: (kind: string) => unknown;
  contextItems: PromptInsertContextItem[];
  /** Call when the menu opens: loads the kind catalog once. */
  loadKinds: () => void;
}

export function usePromptInsertSources(agentId: string): PromptInsertSources {
  const variableDefinitions = useAppSelector((state) => selectAgentVariableDefinitions(state, agentId));
  const contextPolicies = useAppSelector((state) => selectAgentContextPolicies(state, agentId));
  const [catalog, setCatalog] = useState<KindCatalogEntry[] | null>(null);
  const loading = useRef(false);

  const loadKinds = () => {
    if (loading.current) return;
    loading.current = true;
    listAllKinds()
      .then(setCatalog)
      .catch((error: unknown) => {
        // Loud recovery: the compiled kinds keep the menu usable.
        console.error("[PromptInsertMenu] kind catalog DB load failed — compiled kinds only:", error);
        setCatalog(listCompiledKinds());
      });
  };

  const variables = (variableDefinitions ?? [])
    .map((v) => v.name)
    .filter((name): name is string => Boolean(name));
  const contextItems = (contextPolicies ?? []).map((p) => ({ key: p.key, label: p.label }));
  const kinds = catalog
    ? catalog
        .filter((entry) => entry.isActive !== false)
        .map((entry) => ({ kind: entry.kind, label: entry.label }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : null;
  const kindSchema = (kind: string) =>
    catalog ? (kindSchemaToJsonSchema(kind, catalogResolver(catalog))?.schema ?? null) : null;

  return { variables, kinds, kindSchema, contextItems, loadKinds };
}

export interface InsertPromptTextArgs {
  insert: PromptInsert;
  text: string;
  onChange: (next: string) => void;
  /** Write is showing: insert through the editor at its caret. */
  writeController?: RichEditorController | null;
  /** The textarea showing (Plain editing / Split), if any. */
  textarea?: HTMLTextAreaElement | null;
  /** The last caret the host saw when no textarea is showing. */
  fallbackCaret?: { start: number; end: number } | null;
}

/** Insert at the caret as exact text. Returns the caret after the insert (textarea paths). */
export function insertPromptText({
  insert,
  text,
  onChange,
  writeController,
  textarea,
  fallbackCaret,
}: InsertPromptTextArgs): number | null {
  if (writeController) {
    if (insert.placement === "block") {
      // Exactly at the caret, splitting its line there — what Plain does to the text.
      if (!writeController.insertText(insert.text, "caret")) writeController.replaceSelection(insert.text);
    } else {
      writeController.replaceSelection(insert.text);
    }
    return null;
  }
  // The live selection counts only while the textarea still has focus: the menu
  // takes focus, and a box that blurred (or remounted) reports a caret at 0. The
  // caret saved when the menu opened is the person's real caret.
  const live = textarea && typeof document !== "undefined" && document.activeElement === textarea;
  const start = live ? textarea.selectionStart : (fallbackCaret?.start ?? text.length);
  const end = live ? textarea.selectionEnd : (fallbackCaret?.end ?? start);
  const result = insertIntoText(text, start, end, insert);
  onChange(result.text);
  if (textarea) {
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
    });
  }
  return result.caret;
}

export interface PromptWriteBoxProps {
  value: string;
  onChange: (next: string) => void;
  controllerRef: RefObject<RichEditorController | null>;
  surfaceName: string;
  placeholder?: string;
  minHeight?: number;
}

/** Write: the rich editor over the stored prompt text (see header). */
export function PromptWriteBox({
  value,
  onChange,
  controllerRef,
  surfaceName,
  placeholder,
  minHeight = 240,
}: PromptWriteBoxProps) {
  return (
    <div
      data-testid="prompt-write-box"
      className="relative w-full [&_.ProseMirror]:min-h-0! [&_.ProseMirror]:px-0! [&_.ProseMirror]:py-0! [&_.ProseMirror]:font-sans [&_.ProseMirror]:text-xs!"
      style={{ minHeight }}
    >
      <RichEditor
        value={value}
        onChange={onChange}
        view="visual"
        chrome="bare"
        hostContextMenu
        controllerRef={controllerRef}
        placeholder={placeholder}
        surfaceName={surfaceName}
        sourceFeature="agent-builder"
        defaultOutlineOpen={false}
        imagePolicy="other"
        className="h-full"
      />
    </div>
  );
}

/**
 * The shared format buttons in a prompt box's own toolbar row, for every editable mode:
 * Write formats through the editor, Plain editing / Split through the textarea.
 */
export function PromptFormatButtons({
  mode,
  writeRef,
  getTextarea,
}: {
  mode: "write" | "textarea";
  writeRef: RefObject<RichEditorController | null>;
  getTextarea: () => HTMLTextAreaElement | null;
}) {
  return (
    <FormatButtons
      size="xs"
      className="min-w-0 flex-1"
      resolve={() => {
        if (mode === "write") return writeRef.current?.formatTarget?.() ?? null;
        const textarea = getTextarea();
        return textarea && textarea.isConnected ? textareaFormatTarget(textarea) : null;
      }}
    />
  );
}

/**
 * The Insert menu's empty Variable / Context rows link here: the builder section scrolls
 * into view and its Add button takes focus (`data-agent-builder-section` on the left panel).
 */
export function goToBuilderSection(section: "variables" | "context") {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLElement>(`[data-agent-builder-section="${section}"]`);
  if (!element) {
    console.error(`[PromptAssist] builder section "${section}" is not on this page`);
    return;
  }
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  const add = [...element.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    /^add\b/i.test((button.getAttribute("aria-label") ?? button.textContent ?? "").trim()),
  );
  window.setTimeout(() => (add ?? element).focus({ preventScroll: true }), 250);
}
