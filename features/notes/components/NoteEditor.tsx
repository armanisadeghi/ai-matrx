// features/notes/components/NoteEditor.tsx
"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Save,
  Clock,
  Loader2,
  FolderOpen,
  FileText,
  PilcrowRight,
  Eye,
  SplitSquareHorizontal,
  Columns,
} from "lucide-react";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "./TagInput";
import type { Note } from "../types";
import { getNoteMetadata } from "../types";
import { useAutoSave } from "../hooks/useAutoSave";
import { useAllFolders } from "../utils/folderUtils";
import { useNotesRedux } from "../hooks/useNotesRedux";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNotesMap } from "../redux/selectors";
import { cn } from "@/lib/utils";
import { useToastManager } from "@/hooks/useToastManager";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import type { EditorMode as SurfaceEditorMode } from "./NoteEditorCore";
import {
  buildNotesEditorContextData,
  NOTES_EDITOR_CONTEXT_MENU_PROPS,
} from "@/features/notes/agent-context/buildNotesEditorContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";

// Dynamic imports for heavy components (only load when needed)
const TuiEditorContent = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/tui/TuiEditorContent"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    ),
  },
);

// CRITICAL: Dynamic import to prevent loading on routes that don't use notes
// This prevents UnifiedAgentContextMenu and all its hooks from bundling into every route
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2").then((mod) => ({
      default: mod.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

type EditorMode = "plain" | "wysiwyg" | "markdown" | "matrx-split" | "preview";

// This editor's local mode names predate the canonical `matrx-user/notes`
// surface vocabulary (`SurfaceEditorMode`). Map local → surface so the emitted
// `editor_mode` SurfaceValue matches the manifest's declared enum.
const SURFACE_EDITOR_MODE: Record<EditorMode, SurfaceEditorMode> = {
  plain: "plain",
  wysiwyg: "wysiwyg",
  markdown: "markdown-split",
  "matrx-split": "split",
  preview: "preview",
};

interface NoteEditorProps {
  note: Note | null;
  onUpdate?: (noteId: string, updates: Partial<Note>) => void;
  allNotes?: Note[];
  className?: string;
  onForceSave?: () => void;
}

export function NoteEditor({
  note,
  onUpdate,
  allNotes = [],
  className,
  onForceSave,
}: NoteEditorProps) {
  useEffect(() => {
    if (note) {
      console.log(
        "[Track Quick Notes] 10, NoteEditor.tsx — editor rendering note",
        {
          noteId: note.id,
          label: note.label,
          folder: note.folder_name,
        },
      );
    }
  }, [note?.id, note?.label, note?.folder_name]);

  const [localContent, setLocalContent] = useState(note?.content || "");
  const [localFolder, setLocalFolder] = useState(note?.folder_name || "Draft");
  const [localTags, setLocalTags] = useState<string[]>(note?.tags || []);
  const [localLabel, setLocalLabel] = useState(note?.label || "");
  const [editorMode, setEditorMode] = useState<EditorMode>("plain");
  // Live textarea selection, mirrored into React so the surface scope reflects
  // what the user is acting on (matches NotesDemoPanel's selection sync).
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const tuiEditorRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toast = useToastManager("notes");
  const { refreshNotes, setActiveNoteDirty, openTabs } = useNotesRedux();
  const notesMap = useAppSelector(selectNotesMap);

  // Use refs to avoid callback dependencies
  const localContentRef = useRef(localContent);
  const localFolderRef = useRef(localFolder);
  const localTagsRef = useRef(localTags);
  const localLabelRef = useRef(localLabel);
  const editorModeRef = useRef(editorMode);
  const noteRef = useRef(note);
  // isDirtyRef must be declared BEFORE the useEffect below that syncs it
  const isDirtyRef = useRef(false);

  const { isDirty, isSaving, lastSaved, updateWithAutoSave, forceSave } =
    useAutoSave({
      // Disable autosave for the phantom note (no real DB row yet)
      noteId: note?.id && note.id !== "__phantom__" ? note.id : null,
      debounceMs: 2000,
      onSaveSuccess: () => {
        if (note) {
          onUpdate?.(note.id, {
            label: localLabel,
            content: localContent,
            folder_name: localFolder,
            tags: localTags,
            metadata: {
              ...getNoteMetadata(note),
              lastEditorMode: editorMode,
            },
          });
        }
      },
      onSaveError: (err) => {
        toast.error(`Failed to save note: ${err.message}`);
      },
    });

  // Keep refs in sync (isDirtyRef and useAutoSave must be declared above this)
  useEffect(() => {
    localContentRef.current = localContent;
    localFolderRef.current = localFolder;
    localTagsRef.current = localTags;
    localLabelRef.current = localLabel;
    editorModeRef.current = editorMode;
    noteRef.current = note;
    isDirtyRef.current = isDirty;
  }, [
    localContent,
    localFolder,
    localTags,
    localLabel,
    editorMode,
    note,
    isDirty,
  ]);

  // Report dirty state to context so refreshNotes() never overwrites unsaved user input
  useEffect(() => {
    setActiveNoteDirty(isDirty);
    return () => {
      setActiveNoteDirty(false);
    };
  }, [isDirty, setActiveNoteDirty]);

  // Get all folders (default + custom) - optimized to only recalculate when folder names change
  const availableFolders = useAllFolders(allNotes);

  // ── Agent-context surface scope (`matrx-user/notes`) ─────────────────────
  // Mirrors NotesDemoPanel: one `buildNotesEditorContextData` call feeds BOTH
  // the context menu's `contextData` and the Pro inputs' `getApplicationScope`.
  // Live selection is read from the textarea DOM at call time (not snapshotted).
  const syncSelectionFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setSelectionStart(el.selectionStart);
    setSelectionEnd(el.selectionEnd);
  }, []);

  const contextData = buildNotesEditorContextData({
    noteId: note?.id ?? "",
    content: localContent,
    selectionStart,
    selectionEnd,
    editorMode: SURFACE_EDITOR_MODE[editorMode],
    noteRecord: note
      ? {
          label: note.label,
          folder_name: note.folder_name ?? undefined,
          tags: note.tags ?? undefined,
          updated_at: note.updated_at ?? undefined,
        }
      : null,
    isDirty,
    isAutogenerated: note?.id === "__phantom__",
    openTabs,
    splitNoteId: null,
    allFolders: availableFolders,
    notesMap,
  });

  const getApplicationScope = useCallback(() => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? selectionStart;
    const end = el?.selectionEnd ?? selectionEnd;
    const selectedText =
      start !== end
        ? localContent.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData,
    });
  }, [localContent, contextData, selectionEnd, selectionStart]);

  // Load editor mode from note metadata - update when metadata changes
  const noteMetadata = getNoteMetadata(note);
  useEffect(() => {
    if (noteMetadata.lastEditorMode) {
      setEditorMode(noteMetadata.lastEditorMode as EditorMode);
    } else {
      setEditorMode("plain");
    }
  }, [note?.id, noteMetadata.lastEditorMode]); // Update when note ID or mode changes

  // Save current content before switching notes
  useEffect(() => {
    return () => {
      // On cleanup (note changing), ensure latest content is saved
      const currentNote = noteRef.current;
      const currentMode = editorModeRef.current;

      if (
        currentNote &&
        (currentMode === "wysiwyg" || currentMode === "markdown") &&
        tuiEditorRef.current?.getCurrentMarkdown
      ) {
        const markdown = tuiEditorRef.current.getCurrentMarkdown();
        if (markdown !== localContentRef.current) {
          // Update content immediately before switch
          updateWithAutoSave({
            label: localLabelRef.current,
            content: markdown,
            folder_name: localFolderRef.current,
            tags: localTagsRef.current,
            metadata: {
              ...getNoteMetadata(currentNote),
              lastEditorMode: currentMode,
            },
          });
        }
      }

      // Force save any pending changes
      forceSave();
    };
  }, [note?.id, updateWithAutoSave, forceSave]);

  // Sync local state when note changes (switching notes OR explicit refresh from realtime)
  useEffect(() => {
    if (note) {
      setLocalContent(note.content);
      setLocalFolder(note.folder_name || "Draft");
      setLocalTags(note.tags || []);
      setLocalLabel(note.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]); // Only reset when note ID changes

  // Intentionally NOT syncing on note?.updated_at changes.
  // The realtime subscription in NotesContext already shows a toast warning the user
  // about external changes and lets them choose to refresh. Silently overwriting local
  // state here is the primary cause of data loss — even a clean isDirty=false window
  // between saves can clobber content the user just typed.

  // Cleanup label timeout on unmount
  useEffect(() => {
    return () => {
      if (labelSaveTimeoutRef.current) {
        clearTimeout(labelSaveTimeoutRef.current);
      }
    };
  }, []);

  // Expose forceSave to parent (called when user clicks Save button)
  useEffect(() => {
    if (onForceSave && note) {
      // Store the callback so we can call forceSave when user clicks the button
      const handleForceSave = () => {
        // Get latest content from TUI editor if it's active
        let currentContent = localContentRef.current;
        const currentMode = editorModeRef.current;
        if (
          (currentMode === "wysiwyg" || currentMode === "markdown") &&
          tuiEditorRef.current?.getCurrentMarkdown
        ) {
          currentContent = tuiEditorRef.current.getCurrentMarkdown();
        }

        // Update the auto-save queue with all current data
        updateWithAutoSave({
          label: localLabelRef.current,
          content: currentContent,
          folder_name: localFolderRef.current,
          tags: localTagsRef.current,
          metadata: { ...getNoteMetadata(note), lastEditorMode: currentMode },
        });

        // Force immediate save
        forceSave();
      };

      // Store reference for parent to call
      (window as any).__noteEditorForceSave = handleForceSave;
    }

    return () => {
      delete (window as any).__noteEditorForceSave;
    };
  }, [onForceSave, note, updateWithAutoSave, forceSave]);

  // Handle mode change - INSTANT, no database interaction
  const handleModeChange = useCallback((newMode: EditorMode) => {
    // Sync content before switching (but don't trigger save)
    const currentMode = editorModeRef.current;
    if (
      (currentMode === "wysiwyg" || currentMode === "markdown") &&
      tuiEditorRef.current?.getCurrentMarkdown
    ) {
      const markdown = tuiEditorRef.current.getCurrentMarkdown();
      if (markdown !== localContentRef.current) {
        setLocalContent(markdown);
      }
    }

    // Simply update the editor mode - that's it!
    setEditorMode(newMode);

    // Note: The editor mode will be saved automatically when the note is next saved
    // for other reasons (content, folder, tags). No need to trigger a save just for view mode.
  }, []); // No dependencies - stable function

  const handleContentChange = (value: string) => {
    setLocalContent(value);
    if (note) {
      updateWithAutoSave({
        label: localLabel,
        content: value,
        folder_name: localFolder,
        tags: localTags,
        metadata: { ...getNoteMetadata(note), lastEditorMode: editorMode },
      });
      // For phantom notes (id === '__phantom__'), updateWithAutoSave is a no-op.
      // We must call onUpdate so NotesLayout can materialise the real DB note.
      if (note.id === "__phantom__") {
        onUpdate?.(note.id, {
          content: value,
          label: localLabel,
          folder_name: localFolder,
          tags: localTags,
        });
      }
    }
  };

  const handleTuiChange = useCallback(
    (value: string) => {
      setLocalContent(value);
      const currentNote = noteRef.current;
      if (currentNote) {
        updateWithAutoSave({
          label: localLabelRef.current,
          content: value,
          folder_name: localFolderRef.current,
          tags: localTagsRef.current,
          metadata: {
            ...getNoteMetadata(currentNote),
            lastEditorMode: editorModeRef.current,
          },
        });
        // Materialise phantom on TUI editor changes too
        if (currentNote.id === "__phantom__") {
          onUpdate?.(currentNote.id, {
            content: value,
            label: localLabelRef.current,
            folder_name: localFolderRef.current,
            tags: localTagsRef.current,
          });
        }
      }
    },
    [updateWithAutoSave, onUpdate],
  );

  // Voice transcription: ALWAYS append at end with blank line separator
  const handleTranscription = useCallback((text: string) => {
    if (!text.trim()) return;
    const current = localContentRef.current;
    const separator = current.length > 0 ? "\n\n" : "";
    const newContent = current + separator + text;
    handleContentChange(newContent);

    const textarea = textareaRef.current;
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.selectionStart = newContent.length;
        textarea.selectionEnd = newContent.length;
        textarea.focus();
      });
    }
  }, []);

  const handleFolderChange = (value: string) => {
    setLocalFolder(value);
    if (note) {
      updateWithAutoSave({
        label: localLabel,
        content: localContent,
        folder_name: value,
        tags: localTags,
        metadata: { ...getNoteMetadata(note), lastEditorMode: editorMode }, // Include mode
      });
      // Immediate update to parent for sidebar refresh
      onUpdate?.(note.id, { folder_name: value });
    }
  };

  const handleTagsChange = (tags: string[]) => {
    setLocalTags(tags);
    if (note) {
      updateWithAutoSave({
        label: localLabel,
        content: localContent,
        folder_name: localFolder,
        tags,
        metadata: { ...getNoteMetadata(note), lastEditorMode: editorMode }, // Include mode
      });
      // Immediate update to parent
      onUpdate?.(note.id, { tags });
    }
  };

  // Debounced label change - only updates local state immediately, saves after pause
  const handleLabelChange = (newLabel: string) => {
    // Update local state immediately for responsive UI
    setLocalLabel(newLabel);

    // For phantom notes, trigger materialisation immediately on label change
    if (note?.id === "__phantom__") {
      onUpdate?.(note.id, {
        label: newLabel,
        content: localContent,
        folder_name: localFolder,
        tags: localTags,
      });
      return;
    }

    // Clear existing timeout
    if (labelSaveTimeoutRef.current) {
      clearTimeout(labelSaveTimeoutRef.current);
    }

    // Schedule save after 800ms of no typing (slightly longer than content for smoother UX)
    labelSaveTimeoutRef.current = setTimeout(() => {
      if (note) {
        updateWithAutoSave({
          label: newLabel,
          content: localContent,
          folder_name: localFolder,
          tags: localTags,
          metadata: { ...getNoteMetadata(note), lastEditorMode: editorMode },
        });
      }
      labelSaveTimeoutRef.current = null;
    }, 800);
  };

  // Save label immediately on blur
  const handleLabelBlur = () => {
    if (labelSaveTimeoutRef.current) {
      clearTimeout(labelSaveTimeoutRef.current);
      labelSaveTimeoutRef.current = null;
    }

    if (note && localLabel !== note.label) {
      // Force immediate save with forceSave
      updateWithAutoSave({
        label: localLabel,
        content: localContent,
        folder_name: localFolder,
        tags: localTags,
        metadata: { ...getNoteMetadata(note), lastEditorMode: editorMode },
      });
      forceSave();
    }
  };

  if (!note) {
    return (
      <div
        className={cn(
          "flex-1 flex items-center justify-center",
          "h-full bg-textured",
          className,
        )}
      >
        <div className="text-center text-muted-foreground">
          <p className="text-lg">No note selected</p>
          <p className="text-sm mt-2">Select a note or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-textured", className)}>
      {/* Header - Metadata only (title is now in tabs) */}
      <div className="flex-none border-b border-border bg-textured">
        {/* Note Title/Label - NEW */}
        <div className="px-3 pt-3 pb-2">
          <ProInput
            type="text"
            value={localLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                if (editorMode === "plain" && textareaRef.current) {
                  textareaRef.current.focus();
                } else if (
                  (editorMode === "wysiwyg" || editorMode === "markdown") &&
                  tuiEditorRef.current?.getInstance
                ) {
                  const editor = tuiEditorRef.current.getInstance();
                  editor?.focus?.();
                }
              }
            }}
            className="h-auto border-0 bg-transparent py-0 text-lg font-semibold shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
            placeholder="Untitled Note"
          />
        </div>

        {/* Folder, Tags, Status */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* View Mode Selector */}
          <Select
            value={editorMode}
            onValueChange={(value) => handleModeChange(value as EditorMode)}
          >
            <SelectTrigger className="w-[36px] h-7 p-0 border-border">
              <div className="flex items-center justify-center w-full">
                {editorMode === "plain" && <FileText className="h-3.5 w-3.5" />}
                {editorMode === "wysiwyg" && (
                  <PilcrowRight className="h-3.5 w-3.5" />
                )}
                {editorMode === "markdown" && (
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                )}
                {editorMode === "matrx-split" && (
                  <Columns className="h-3.5 w-3.5" />
                )}
                {editorMode === "preview" && <Eye className="h-3.5 w-3.5" />}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain" className="text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">Plain Text</span>
                    <span className="text-[10px] text-muted-foreground">
                      Simple editor
                    </span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="wysiwyg" className="text-xs">
                <div className="flex items-center gap-2">
                  <PilcrowRight className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">Rich Editor</span>
                    <span className="text-[10px] text-muted-foreground">
                      WYSIWYG
                    </span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="markdown" className="text-xs">
                <div className="flex items-center gap-2">
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">Split View</span>
                    <span className="text-[10px] text-muted-foreground">
                      Markdown + Preview
                    </span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="matrx-split" className="text-xs">
                <div className="flex items-center gap-2">
                  <Columns className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">Matrx Split</span>
                    <span className="text-[10px] text-muted-foreground">
                      Editor + Preview
                    </span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="preview" className="text-xs">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">Preview</span>
                    <span className="text-[10px] text-muted-foreground">
                      Read-only
                    </span>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Folder Selector */}
          <Select value={localFolder} onValueChange={handleFolderChange}>
            <SelectTrigger className="w-[140px] h-7 text-xs">
              <div className="flex items-center gap-1.5 min-w-0 w-full">
                <FolderOpen className="h-3 w-3 flex-shrink-0" />
                <div className="truncate flex-1 min-w-0">
                  <SelectValue />
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              {availableFolders.map((folder) => (
                <SelectItem key={folder} value={folder} className="text-xs">
                  {folder}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tags */}
          <div className="flex-1 min-w-0">
            <TagInput
              tags={localTags}
              onChange={handleTagsChange}
              className="h-7 text-xs"
            />
          </div>

          {/* Voice Input */}
          <MicrophoneIconButton
            onTranscriptionComplete={handleTranscription}
            variant="icon-only"
            size="sm"
          />
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative overflow-hidden bg-textured">
        {/* Editor Content with Unified Context Menu */}
        {editorMode === "plain" && (
          <UnifiedAgentContextMenu
            {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
            getTextarea={() => textareaRef.current}
            getApplicationScope={getApplicationScope}
            contextData={contextData}
            onTextReplace={(newText) => {
              const textarea = textareaRef.current;
              if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const before = localContent.substring(0, start);
                const after = localContent.substring(end);
                const updatedContent = before + newText + after;
                handleContentChange(updatedContent);

                // Restore focus and select replaced text
                setTimeout(() => {
                  textarea.focus();
                  textarea.setSelectionRange(start, start + newText.length);
                }, 0);
              }
            }}
            onTextInsertBefore={(text) => {
              const textarea = textareaRef.current;
              if (textarea) {
                const start = textarea.selectionStart;
                const before = localContent.substring(0, start);
                const after = localContent.substring(start);
                const insertText = text + "\n\n";
                handleContentChange(before + insertText + after);

                setTimeout(() => {
                  textarea.focus();
                  textarea.setSelectionRange(
                    start + insertText.length,
                    start + insertText.length,
                  );
                }, 0);
              }
            }}
            onTextInsertAfter={(text) => {
              const textarea = textareaRef.current;
              if (textarea) {
                const end = textarea.selectionEnd;
                const before = localContent.substring(0, end);
                const after = localContent.substring(end);
                const insertText = "\n\n" + text;
                handleContentChange(before + insertText + after);

                setTimeout(() => {
                  textarea.focus();
                  textarea.setSelectionRange(
                    end + insertText.length,
                    end + insertText.length,
                  );
                }, 0);
              }
            }}
            onContentInserted={() => {
              // Content block was inserted - already handled by content change
            }}
          >
            <ProTextarea
              ref={textareaRef}
              surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
              getApplicationScope={getApplicationScope}
              value={localContent}
              onChange={(e) => {
                handleContentChange(e.target.value);
                setSelectionStart(e.target.selectionStart);
                setSelectionEnd(e.target.selectionEnd);
              }}
              onSelect={syncSelectionFromTextarea}
              onKeyUp={syncSelectionFromTextarea}
              onMouseUp={syncSelectionFromTextarea}
              placeholder="Start typing your note..."
              wrapperClassName="absolute inset-0 w-full h-full"
              className="w-full h-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm leading-relaxed bg-transparent p-3 pb-[50dvh] shadow-none"
            />
          </UnifiedAgentContextMenu>
        )}

        {editorMode === "wysiwyg" && (
          <UnifiedAgentContextMenu
            {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
            getApplicationScope={getApplicationScope}
            contextData={contextData}
            onTextReplace={(newText) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                const range = editor.getSelection();
                editor.replaceSelection(newText);
              }
            }}
            onTextInsertBefore={(text) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                editor.insertText(text + "\n\n");
              }
            }}
            onTextInsertAfter={(text) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                const currentContent =
                  tuiEditorRef.current.getCurrentMarkdown();
                handleTuiChange(currentContent + "\n\n" + text);
              }
            }}
            onContentInserted={() => {
              // Content block inserted via TUI editor
            }}
          >
            <div className="absolute inset-0 w-full h-full">
              <TuiEditorContent
                ref={tuiEditorRef}
                content={localContent}
                onChange={handleTuiChange}
                isActive={true}
                editMode="wysiwyg"
                className="w-full h-full"
              />
            </div>
          </UnifiedAgentContextMenu>
        )}

        {editorMode === "markdown" && (
          <UnifiedAgentContextMenu
            {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
            getApplicationScope={getApplicationScope}
            contextData={contextData}
            onTextReplace={(newText) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                editor.replaceSelection(newText);
              }
            }}
            onTextInsertBefore={(text) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                editor.insertText(text + "\n\n");
              }
            }}
            onTextInsertAfter={(text) => {
              if (tuiEditorRef.current?.getInstance) {
                const editor = tuiEditorRef.current.getInstance();
                const currentContent =
                  tuiEditorRef.current.getCurrentMarkdown();
                handleTuiChange(currentContent + "\n\n" + text);
              }
            }}
            onContentInserted={() => {
              // Content block inserted
            }}
          >
            <div className="absolute inset-0 w-full h-full">
              <TuiEditorContent
                ref={tuiEditorRef}
                content={localContent}
                onChange={handleTuiChange}
                isActive={true}
                editMode="markdown"
                className="w-full h-full"
              />
            </div>
          </UnifiedAgentContextMenu>
        )}

        {editorMode === "matrx-split" && (
          <MatrxSplit
            value={localContent}
            onChange={handleContentChange}
            textareaRef={textareaRef}
            placeholder="Start typing your note..."
            className="absolute inset-0"
          />
        )}

        {editorMode === "preview" && (
          <UnifiedAgentContextMenu
            {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
            isEditable={false}
            getApplicationScope={getApplicationScope}
            contextData={contextData}
          >
            <ScrollArea className="absolute inset-0 w-full h-full">
              <div className="p-6 pb-[50dvh] bg-textured">
                {localContent.trim() ? (
                  <RichDocument
                    content={localContent}
                    source={
                      note?.id && note.id !== "__phantom__"
                        ? ({ type: "note", noteId: note.id } as ContentSource)
                        : ({ type: "raw" } as ContentSource)
                    }
                    actionsVariant="bar"
                    actionsClassName="mb-3"
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No content to preview
                  </div>
                )}
              </div>
            </ScrollArea>
          </UnifiedAgentContextMenu>
        )}
      </div>
    </div>
  );
}
