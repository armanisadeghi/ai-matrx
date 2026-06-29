/**
 * CodeEditorContextMenu
 *
 * Integrates the universal v3 `EditableContextMenu` with the EMBEDDED Monaco editor (agent
 * builder, prompt-app editor, notes, `SmallCodeEditor`). The new `/code`
 * workspace uses `features/code/agent-context/CodeWorkspaceContextMenu` — both
 * emit the SAME `matrx-user/code-editor` scope through the shared
 * `buildCodeWorkspaceContextData`, so a Shortcut or bound agent works
 * identically in either surface.
 *
 * Editable region of the surface: uses the editable wrapper + wires
 * `onTextReplace` / `onTextInsertBefore` / `onTextInsertAfter` so agent output
 * applies in place via Monaco's `executeEdits`.
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { editor } from 'monaco-editor';
import {
  buildCodeWorkspaceContextData,
  codeEditorLaunchScope,
  CODE_WORKSPACE_CONTEXT_MENU_PROPS,
  type CodeSelectionRange,
} from '@/features/code/agent-context/buildCodeWorkspaceContextData';
import type { EditorDiagnostic } from '@/features/code/redux/diagnosticsSlice';
import { formatEditorSurroundContext } from '@/utils/format-editor-surround-context';
import type { ApplicationScope } from '@/features/agents/utils/scope-mapping';

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from '@/features/context-menu-v3/EditableContextMenu';

interface CodeEditorContextMenuProps {
    children: React.ReactNode;
    /** Monaco editor instance */
    editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
    /** Programming language (javascript, typescript, python, etc.) */
    language?: string;
    /** Optional file path */
    filePath?: string;
    /** Callback after text is replaced */
    onTextReplaced?: (newText: string) => void;
    /** className for wrapper */
    className?: string;
}

/** Monaco marker severities (`monaco.MarkerSeverity`): Error=8, Warning=4, Info=2, Hint=1. */
function markerToDiagnostic(m: editor.IMarker): EditorDiagnostic {
    const severity: EditorDiagnostic['severity'] =
        m.severity === 8
            ? 'error'
            : m.severity === 4
              ? 'warning'
              : m.severity === 2
                ? 'info'
                : 'hint';
    return {
        severity,
        message: m.message,
        source: m.source,
        code: typeof m.code === 'object' ? m.code?.value : m.code,
        startLine: m.startLineNumber,
        endLine: m.endLineNumber,
        startColumn: m.startColumn,
        endColumn: m.endColumn,
    };
}

/**
 * Wraps an embedded Monaco editor with the unified agent context menu.
 * Provides code-specific AI actions via right-click + inline apply.
 */
export function CodeEditorContextMenu({
    children,
    editorRef,
    language = 'javascript',
    filePath,
    onTextReplaced,
    className,
}: CodeEditorContextMenuProps) {
    const [selectedText, setSelectedText] = useState('');

    // Track selection live so the menu can surface "selection-only" shortcuts.
    useEffect(() => {
        const ed = editorRef.current;
        if (!ed) return undefined;

        const sync = () => {
            const selection = ed.getSelection();
            const model = ed.getModel();
            if (!selection || selection.isEmpty() || !model) {
                setSelectedText('');
                return;
            }
            setSelectedText(model.getValueInRange(selection));
        };

        sync();
        const disposable = ed.onDidChangeCursorSelection(sync);
        return () => disposable.dispose();
    }, [editorRef]);

    // Canonical `matrx-user/code-editor` scope — baselines + declared
    // SurfaceValues + the `vsc_*` contract, re-derived live at call time.
    const getContextData = (): Record<string, unknown> => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        const position = ed?.getPosition();
        const selection = ed?.getSelection();

        const fullContent = ed?.getValue() ?? '';
        const resolvedPath = filePath ?? model?.uri.path ?? 'untitled';
        const resolvedLanguage = language ?? model?.getLanguageId() ?? 'plaintext';

        const monaco = (
            window as unknown as {
                monaco?: {
                    editor: {
                        getModelMarkers: (filter: {
                            resource?: editor.IMarker['resource'];
                        }) => editor.IMarker[];
                    };
                };
            }
        ).monaco;
        const markers = model
            ? (monaco?.editor.getModelMarkers({ resource: model.uri }) ?? [])
            : [];
        const diagnostics = markers.map(markerToDiagnostic);

        let textBefore = '';
        let textAfter = '';
        let selectionRange: CodeSelectionRange | null = null;
        let surroundContext: string | undefined;
        if (model && selection) {
            const startOffset = model.getOffsetAt({
                lineNumber: selection.startLineNumber,
                column: selection.startColumn,
            });
            const endOffset = model.getOffsetAt({
                lineNumber: selection.endLineNumber,
                column: selection.endColumn,
            });
            textBefore = fullContent.slice(Math.max(0, startOffset - 500), startOffset);
            textAfter = fullContent.slice(endOffset, endOffset + 500);
            surroundContext = formatEditorSurroundContext(fullContent, {
                selectionStart: startOffset,
                selectionEnd: endOffset,
            });
            if (!selection.isEmpty()) {
                selectionRange = {
                    startLine: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLine: selection.endLineNumber,
                    endColumn: selection.endColumn,
                };
            }
        }

        return buildCodeWorkspaceContextData({
            fullContent,
            selectedText,
            language: resolvedLanguage,
            filePath: resolvedPath,
            currentLine: position?.lineNumber ?? 0,
            currentColumn: position?.column ?? 0,
            lineCount: model?.getLineCount() ?? 0,
            activeTabDiagnostics: diagnostics,
            allDiagnostics: resolvedPath ? { [resolvedPath]: diagnostics } : {},
            textBefore,
            textAfter,
            selectionRange,
            surroundContext,
        });
    };

    // `getContextData()` already produces a complete, live scope (baselines +
    // declared SurfaceValues + `vsc_*`); `codeEditorLaunchScope` drops the
    // menu-only `contextFilter` key before it reaches the agent.
    const getApplicationScope = (): ApplicationScope =>
        codeEditorLaunchScope(getContextData()) as ApplicationScope;

    // Apply an agent's replacement text over the live selection.
    const handleTextReplace = (newText: string) => {
        const ed = editorRef.current;
        const selection = ed?.getSelection();
        if (!ed || !selection) return;
        ed.executeEdits('ai-replace', [
            { range: selection, text: newText, forceMoveMarkers: true },
        ]);
        ed.focus();
        onTextReplaced?.(newText);
    };

    const handleTextInsertBefore = (text: string) => {
        const ed = editorRef.current;
        const position = ed?.getPosition();
        if (!ed || !position) return;
        ed.executeEdits('ai-insert-before', [
            {
                range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                },
                text,
                forceMoveMarkers: true,
            },
        ]);
        ed.focus();
    };

    const handleTextInsertAfter = (text: string) => {
        const ed = editorRef.current;
        const selection = ed?.getSelection();
        if (!ed || !selection) return;
        ed.executeEdits('ai-insert-after', [
            {
                range: {
                    startLineNumber: selection.endLineNumber,
                    startColumn: selection.endColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn,
                },
                text,
                forceMoveMarkers: true,
            },
        ]);
        ed.focus();
    };

    return (
        <div className={className}>
            <EditableContextMenu
                {...CODE_WORKSPACE_CONTEXT_MENU_PROPS}
                contextData={getContextData()}
                getApplicationScope={getApplicationScope}
                onTextReplace={handleTextReplace}
                onTextInsertBefore={handleTextInsertBefore}
                onTextInsertAfter={handleTextInsertAfter}
            >
                {children}
            </EditableContextMenu>
        </div>
    );
}
