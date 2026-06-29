"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addEditorErrorResource,
  editorErrorDedupeKey,
} from "@/features/agents/utils/add-editor-resources";
import type { EditorErrorSource } from "@/features/agents/utils/editor-resource-xml";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";
import type { EditorFile } from "../types";
import type { EditorDiagnostic } from "../redux/diagnosticsSlice";

interface UseDiagnosticHoverActionsOptions {
  editorRef: MutableRefObject<StandaloneCodeEditor | null>;
  /**
   * Bump-counter the host increments when Monaco's `onMount` fires so the
   * registration effect re-runs once the editor instance is attached.
   */
  editorReadyTick: number;
  /** The active tab — provides path / language / id for the resource source. */
  activeTab: EditorFile | null | undefined;
  /** Diagnostics for the active tab, from `selectDiagnosticsByTabId`. */
  diagnostics: EditorDiagnostic[];
  /** The conversation the editor's chat panel is bound to. */
  conversationId: string | null | undefined;
  /** Optional toast hook for user-visible feedback. */
  notify?: (msg: { type: "success" | "error" | "info"; text: string }) => void;
}

/**
 * Adds a Monaco hover provider that augments the default hover for any line
 * carrying a diagnostic with a "Send to AI chat" link. Clicking the link
 * dispatches an `editor_error` resource to the active conversation —
 * the chip surfaces in the chat input above the textarea.
 *
 * The provider keys diagnostics by file path + line + first column so it can
 * resolve which diagnostic the user is hovering when there are multiple on
 * the same line.
 */
export function useDiagnosticHoverActions({
  editorRef,
  editorReadyTick,
  activeTab,
  diagnostics,
  conversationId,
  notify,
}: UseDiagnosticHoverActionsOptions): void {
  const dispatch = useAppDispatch();

  // Stable refs so the command callback always sees the freshest data without
  // re-registering the provider on every change (which would cause flicker
  // and lose the user's hover).
  const diagnosticsRef = useRef(diagnostics);
  const activeTabRef = useRef(activeTab);
  const conversationIdRef = useRef(conversationId);
  const sentKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Reset dedupe set when the conversation changes — the same diagnostic in
  // a new conversation should be sendable again.
  useEffect(() => {
    sentKeysRef.current = new Set();
  }, [conversationId]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;

    // Lazy import to keep monaco out of SSR bundles.
    let disposed = false;
    let providerHandle: { dispose: () => void } | null = null;
    let commandHandle: { dispose: () => void } | null = null;

    (async () => {
      const monaco = await import("monaco-editor");
      if (disposed) return;

      // Editor command — invoked via command URI in the hover markdown.
      // Args are passed through Monaco's `args` array — we serialize the
      // dedupe key into the URI so we can look up the diagnostic at click
      // time (the hover snapshot may be stale by then if the user typed).
      const COMMAND_ID = "matrx.ai.sendDiagnosticToChat";
      commandHandle = monaco.editor.registerCommand(
        COMMAND_ID,
        (_accessor: unknown, dedupeKey: string) => {
          const tab = activeTabRef.current;
          const conv = conversationIdRef.current;
          if (!tab) {
            notify?.({
              type: "error",
              text: "Open a file first.",
            });
            return;
          }
          if (!conv) {
            notify?.({
              type: "error",
              text: "Open a chat conversation first.",
            });
            return;
          }
          const list = diagnosticsRef.current;
          const diagnostic = list.find(
            (d) => buildDedupeKey(tab.path, d) === dedupeKey,
          );
          if (!diagnostic) {
            notify?.({
              type: "error",
              text: "That diagnostic is no longer available.",
            });
            return;
          }
          const source: EditorErrorSource = {
            file: tab.path,
            line: diagnostic.startLine,
            endLine: diagnostic.endLine,
            severity: diagnostic.severity,
            source: diagnostic.source,
            code:
              typeof diagnostic.code === "number"
                ? String(diagnostic.code)
                : diagnostic.code,
            message: diagnostic.message,
            language: tab.language,
            surroundingCode: extractSurrounding(editor, diagnostic),
          };
          const key = editorErrorDedupeKey(source);
          if (sentKeysRef.current.has(key)) {
            notify?.({
              type: "info",
              text: "Already attached.",
            });
            return;
          }
          addEditorErrorResource(dispatch, conv, source);
          sentKeysRef.current.add(key);
          notify?.({
            type: "success",
            text: `Diagnostic attached (${tab.name}:${diagnostic.startLine}).`,
          });
        },
      );

      providerHandle = monaco.languages.registerHoverProvider("*", {
        provideHover: (model, position) => {
          const tab = activeTabRef.current;
          if (!tab) return null;
          // Match by line. For multi-line diagnostics, hovering anywhere
          // inside the range counts.
          const line = position.lineNumber;
          const list = diagnosticsRef.current;
          const matches = list.filter(
            (d) => d.startLine <= line && d.endLine >= line,
          );
          if (matches.length === 0) return null;

          const contents = matches.map((d) => {
            const dedupeKey = buildDedupeKey(tab.path, d);
            const args = encodeURIComponent(JSON.stringify(dedupeKey));
            const sevPrefix = severityIcon(d.severity);
            return {
              isTrusted: true,
              supportThemeIcons: true,
              value:
                `${sevPrefix} **${escapeMd(d.source ?? "diagnostic")}**` +
                (d.code !== undefined ? ` \`${escapeMd(String(d.code))}\`` : "") +
                `\n\n${escapeMd(d.message)}\n\n` +
                `[$(send) Send to AI chat](command:matrx.ai.sendDiagnosticToChat?${args})`,
            };
          });

          // Range covering the first matching diagnostic (Monaco uses this
          // to underline / highlight the hovered region).
          const first = matches[0];
          return {
            range: new monaco.Range(
              first.startLine,
              first.startColumn,
              first.endLine,
              first.endColumn,
            ),
            contents,
          };
        },
      });
    })();

    return () => {
      disposed = true;
      try {
        providerHandle?.dispose();
      } catch {
        /* monaco may be disposing too */
      }
      try {
        commandHandle?.dispose();
      } catch {
        /* idem */
      }
    };
  }, [editorRef, editorReadyTick, dispatch, notify]);
}

// =============================================================================
// Helpers
// =============================================================================

function buildDedupeKey(path: string, d: EditorDiagnostic): string {
  return [
    path,
    d.startLine,
    d.startColumn,
    d.code ?? "",
    d.source ?? "",
    d.message.slice(0, 80),
  ].join("|");
}

function severityIcon(sev: EditorDiagnostic["severity"]): string {
  // Markdown supports VS Code's $(icon) syntax when supportThemeIcons is on.
  switch (sev) {
    case "error":
      return "$(error)";
    case "warning":
      return "$(warning)";
    case "info":
      return "$(info)";
    case "hint":
      return "$(lightbulb)";
  }
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}\[\]()#+\-.!]/g, (c) => `\\${c}`);
}

function extractSurrounding(
  editor: StandaloneCodeEditor,
  d: EditorDiagnostic,
  pad = 2,
): string | undefined {
  try {
    const model = editor.getModel();
    if (!model) return undefined;
    const startLine = Math.max(1, d.startLine - pad);
    const endLine = Math.min(model.getLineCount(), d.endLine + pad);
    const lines: string[] = [];
    for (let l = startLine; l <= endLine; l++) {
      const prefix = `${String(l).padStart(4)} | `;
      lines.push(`${prefix}${model.getLineContent(l)}`);
    }
    return lines.join("\n");
  } catch {
    return undefined;
  }
}
