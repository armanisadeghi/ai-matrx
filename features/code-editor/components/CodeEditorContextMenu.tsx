/**
 * CodeEditorContextMenu
 *
 * Integrates UnifiedAgentContextMenu with Monaco code editor.
 * Provides AI-powered actions specifically for code editing.
 *
 * Features:
 * - Right-click context menu with AI actions
 * - Code-specific categories (Code Operations, Text Operations)
 * - Custom scopes for Monaco (language, errors, diagnostics)
 * - Inline text replacement
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamic — keeps UnifiedAgentContextMenu out of the code-editor bundle.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import('@/features/context-menu-v2').then((mod) => ({
      default: mod.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);
import { PLACEMENT_TYPES } from '@/features/agent-shortcuts/constants';
import type { editor } from 'monaco-editor';

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

/**
 * Wraps Monaco editor with context menu support.
 * Provides code-specific AI actions via right-click.
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
    const [fullContent, setFullContent] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Track selection changes
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
            const selection = editor.getSelection();
            if (!selection || selection.isEmpty()) {
                setSelectedText('');
                return;
            }

            const model = editor.getModel();
            if (!model) return;

            const text = model.getValueInRange(selection);
            setSelectedText(text);
        });

        const contentDisposable = editor.onDidChangeModelContent(() => {
            const content = editor.getValue();
            setFullContent(content);
        });

        // Initial values
        setFullContent(editor.getValue());
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
            const model = editor.getModel();
            if (model) {
                setSelectedText(model.getValueInRange(selection));
            }
        }

        return () => {
            selectionDisposable.dispose();
            contentDisposable.dispose();
        };
    }, [editorRef]);

    // Build scopes for AI actions
    const buildScopes = useCallback((): Record<string, any> => {
        const editor = editorRef.current;
        if (!editor) {
            return {
                selection: '',
                content: '',
                context: '',
            };
        }

        const model = editor.getModel();
        const position = editor.getPosition();

        // Get Monaco diagnostics (errors, warnings)
        const monaco = (window as any).monaco;
        const markers = monaco?.editor.getModelMarkers({ resource: model?.uri }) || [];

        // Build context with multiple files support (for future)
        const contextData = {
            language,
            filePath: filePath || model?.uri.path || 'untitled',
            lineCount: model?.getLineCount() || 0,
            currentLine: position?.lineNumber || 0,
            currentColumn: position?.column || 0,
            hasSelection: !editor.getSelection()?.isEmpty(),
            // Future: Add other open files here
        };

        return {
            // Default scopes
            selection: selectedText,
            content: fullContent,
            context: JSON.stringify(contextData, null, 2),

            // Custom Monaco scopes
            language,
            filePath: filePath || 'untitled',
            errors: JSON.stringify(markers.filter((m: any) => m.severity === 8), null, 2), // Errors
            warnings: JSON.stringify(markers.filter((m: any) => m.severity === 4), null, 2), // Warnings
            diagnostics: JSON.stringify(markers, null, 2), // All markers
            lineCount: model?.getLineCount() || 0,
            currentLine: position?.lineNumber || 0,
        };
    }, [selectedText, fullContent, language, filePath, editorRef]);

    // Handle text replacement
    const handleTextReplace = useCallback((newText: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) return;

        // Execute edit
        const edits = [{
            range: selection,
            text: newText,
            forceMoveMarkers: true,
        }];

        editor.executeEdits('ai-replace', edits);

        // Select the new text
        const monaco = (window as any).monaco;
        if (monaco) {
            const startLine = selection.startLineNumber;
            const startCol = selection.startColumn;
            const lines = newText.split('\n');
            const endLine = startLine + lines.length - 1;
            const endCol = lines.length === 1 ? startCol + newText.length : lines[lines.length - 1].length + 1;

            editor.setSelection(new monaco.Range(
                startLine,
                startCol,
                endLine,
                endCol
            ));
        }

        // Focus editor
        editor.focus();

        // Callback
        onTextReplaced?.(newText);
    }, [editorRef, onTextReplaced]);

    // Handle text insert before selection
    const handleTextInsertBefore = useCallback((text: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        const position = editor.getPosition();
        if (!position) return;

        editor.executeEdits('ai-insert-before', [{
            range: new (window as any).monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            text,
            forceMoveMarkers: true,
        }]);

        editor.focus();
    }, [editorRef]);

    // Handle text insert after selection
    const handleTextInsertAfter = useCallback((text: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) return;

        editor.executeEdits('ai-insert-after', [{
            range: new (window as any).monaco.Range(
                selection.endLineNumber,
                selection.endColumn,
                selection.endLineNumber,
                selection.endColumn
            ),
            text,
            forceMoveMarkers: true,
        }]);

        editor.focus();
    }, [editorRef]);

    // Get context data dynamically
    const getContextData = useCallback(() => {
        const scopes = buildScopes();
        return {
            content: scopes.content,
            context: scopes.context,
            contextFilter: 'code-editor', // Filter to code-editor enabled contexts
            // Pass custom scopes through contextData
            ...scopes,
        };
    }, [buildScopes]);

    return (
        <div ref={wrapperRef} className={className}>
            <UnifiedAgentContextMenu
                sourceFeature="code-editor"
                surfaceName="matrx-user/code-editor"
                isEditable={true}
                onTextReplace={handleTextReplace}
                onTextInsertBefore={handleTextInsertBefore}
                onTextInsertAfter={handleTextInsertAfter}
                enabledPlacements={[
                    PLACEMENT_TYPES.AI_ACTION,
                    PLACEMENT_TYPES.ORGANIZATION_TOOL,
                    PLACEMENT_TYPES.USER_TOOL,
                    // Note: We're not including CONTENT_BLOCK for now since code blocks
                    // are handled differently than regular content blocks
                ]}
                contextData={getContextData()}
            >
                {children}
            </UnifiedAgentContextMenu>
        </div>
    );
}
