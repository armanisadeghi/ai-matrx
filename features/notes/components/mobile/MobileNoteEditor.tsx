'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useNotesRedux } from '../../hooks/useNotesRedux';
import { NoteEditorDock } from './NoteEditorDock';
import { useNoteDelete } from '../../hooks/useNoteDelete';
import { useToastManager } from '@/hooks/useToastManager';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { RichDocument } from '@/features/rich-document/RichDocument';
import type { ContentSource } from '@/features/rich-document/types';
import type { Note } from '@/features/notes/types';

export type MobileEditorMode = 'plain' | 'wysiwyg' | 'preview';

// Heavy TUI editor — only loaded when needed
const TuiEditorContent = dynamic(
  () => import('@/components/mardown-display/chat-markdown/tui/TuiEditorContent'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface MobileNoteEditorProps {
  note: Note;
  editorMode: MobileEditorMode;
  onBack: () => void;
}

export default function MobileNoteEditor({ note, editorMode, onBack }: MobileNoteEditorProps) {
  const { updateNote, deleteNote, copyNote, setActiveNoteDirty } = useNotesRedux();
  const toast = useToastManager('notes');

  const [localLabel, setLocalLabel] = useState(note.label || '');
  const [localContent, setLocalContent] = useState(note.content || '');
  const [localFolder, setLocalFolder] = useState(note.folder_name || 'Draft');
  const [localTags, setLocalTags] = useState<string[]>(note.tags || []);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    confirmOpen: deleteConfirmOpen,
    isDeleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useNoteDelete({
    instanceId: "",
    noteId: note.id,
    noteLabel: localLabel || "Untitled Note",
    closeTab: false,
    onDeleted: onBack,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tuiRef = useRef<any>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Capture the server baseline when the note first loads (or switches).
  // We compare local edits against THIS snapshot — not the live `note` prop —
  // so that realtime context updates don't reset isDirty to false mid-edit.
  const savedBaselineRef = useRef({
    label: note.label || '',
    content: note.content || '',
    folder_name: note.folder_name || 'Draft',
    tags: JSON.stringify(note.tags || []),
  });

  // Sync when note switches (ID change only)
  useEffect(() => {
    const baseline = {
      label: note.label || '',
      content: note.content || '',
      folder_name: note.folder_name || 'Draft',
      tags: JSON.stringify(note.tags || []),
    };
    savedBaselineRef.current = baseline;
    setLocalLabel(baseline.label);
    setLocalContent(baseline.content);
    setLocalFolder(baseline.folder_name);
    setLocalTags(note.tags || []);
    setIsDirty(false);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report dirty state to context so refreshNotes() never overwrites unsaved user input
  useEffect(() => {
    setActiveNoteDirty(isDirty);
    return () => { setActiveNoteDirty(false); };
  }, [isDirty, setActiveNoteDirty]);

  // Track dirty state against the saved baseline (not the live note prop)
  useEffect(() => {
    const baseline = savedBaselineRef.current;
    const hasChanges =
      localLabel !== baseline.label ||
      localContent !== baseline.content ||
      localFolder !== baseline.folder_name ||
      JSON.stringify(localTags) !== baseline.tags;
    setIsDirty(hasChanges);
  }, [localLabel, localContent, localFolder, localTags]);

  // Auto-grow plain textarea
  const growTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (editorMode === 'plain') growTextarea();
  }, [localContent, editorMode, growTextarea]);

  // Auto-save 2s after last change
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!isDirty || isSaving) return;
      setIsSaving(true);
      const label = localLabel.trim() || 'Untitled Note';
      const content = localContent;
      const folder = localFolder;
      const tags = localTags;
      try {
        await updateNote(note.id, { label, content, folder_name: folder, tags });
        // Update baseline so dirty check doesn't flip back to true on next compare
        savedBaselineRef.current = {
          label,
          content,
          folder_name: folder,
          tags: JSON.stringify(tags),
        };
        setIsDirty(false);
      } catch {
        // silent — user can see save button
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [isDirty, isSaving, note.id, localLabel, localContent, localFolder, localTags, updateNote]);

  useEffect(() => {
    if (isDirty) scheduleAutoSave();
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [isDirty, scheduleAutoSave]);

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setIsSaving(true);
    try {
      // Capture latest TUI content if in rich mode
      let content = localContent;
      if ((editorMode === 'wysiwyg') && tuiRef.current?.getCurrentMarkdown) {
        content = tuiRef.current.getCurrentMarkdown();
        setLocalContent(content);
      }
      const label = localLabel.trim() || 'Untitled Note';
      await updateNote(note.id, {
        label,
        content,
        folder_name: localFolder,
        tags: localTags,
      });
      // Update the baseline so dirty tracking reflects the just-saved values.
      // Do NOT call refreshNotes() — that fetches from server and can overwrite
      // content the user is actively editing if a realtime echo arrives simultaneously.
      savedBaselineRef.current = {
        label,
        content,
        folder_name: localFolder,
        tags: JSON.stringify(localTags),
      };
      setIsDirty(false);
    } catch {
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  // Expose save state and handler to parent (MobileNotesView injects into header)
  // We use a module-level ref pattern so the parent can read current values
  useEffect(() => {
    (window as any).__mobileNoteEditorState = { isDirty, isSaving, handleSave };
    return () => { delete (window as any).__mobileNoteEditorState; };
  });


  const handleCopy = async () => {
    try {
      await copyNote(note.id);
      toast.success('Note duplicated');
    } catch {
      toast.error('Failed to duplicate note');
    }
  };

  const handleExport = () => {
    const content = (editorMode === 'wysiwyg' && tuiRef.current?.getCurrentMarkdown)
      ? tuiRef.current.getCurrentMarkdown()
      : localContent;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localLabel || 'note'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  return (
    // Flex column fills the parent — content scrolls, dock stays at bottom
    <div className="h-full bg-background flex flex-col overflow-hidden relative">
      {/* ── Scrollable content area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-32">

        {/* Plain text */}
        {editorMode === 'plain' && (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={e => { setLocalContent(e.target.value); growTextarea(); }}
            placeholder="Start writing..."
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none border-none resize-none leading-relaxed"
            style={{ fontSize: '16px', minHeight: 'calc(100dvh - 200px)' }}
          />
        )}

        {/* Rich (WYSIWYG) */}
        {editorMode === 'wysiwyg' && (
          <div className="min-h-[calc(100dvh-200px)]">
            <TuiEditorContent
              ref={tuiRef}
              content={localContent}
              onChange={(val: string) => setLocalContent(val)}
              isActive={true}
              editMode="wysiwyg"
              className="w-full"
            />
          </div>
        )}

        {/* Preview */}
        {editorMode === 'preview' && (
          <div className="min-h-[calc(100dvh-200px)] prose prose-sm dark:prose-invert max-w-none">
            {localContent.trim() ? (
              <RichDocument
                content={localContent}
                source={{ type: "note", noteId: note.id } as ContentSource}
                actionsVariant="mini-bar"
                actionsClassName="mb-2"
              />
            ) : (
              <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed bottom dock ────────────────────────────────────────────────── */}
      <NoteEditorDock
        noteId={note.id}
        folder={localFolder}
        tags={localTags}
        content={localContent}
        onFolderChange={setLocalFolder}
        onTagsChange={setLocalTags}
        onDuplicate={handleCopy}
        onExport={handleExport}
        onDelete={requestDelete}
        isDeleting={isDeleting}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!open) cancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{localLabel || 'Untitled Note'}&rdquo; will be moved to trash. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
