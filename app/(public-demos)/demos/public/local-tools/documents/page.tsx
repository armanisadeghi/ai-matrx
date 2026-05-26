'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    Clock,
    Edit3,
    FilePlus,
    FileText,
    Folder,
    FolderOpen,
    FolderPlus,
    GitBranch,
    HardDrive,
    Link2,
    Loader2,
    Map,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Share2,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { ConnectionBar } from '../_lib/ConnectionBar';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';
import type { DocFolder, DocNote, NoteVersion, SyncStatus, DocConflict } from '../_lib/types';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type ActiveTab = 'notes' | 'sync' | 'versions' | 'conflicts' | 'local' | 'shares' | 'mappings';

const TABS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'sync', label: 'Sync', icon: RefreshCw },
    { id: 'versions', label: 'Versions', icon: Clock },
    { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
    { id: 'local', label: 'Local Files', icon: HardDrive },
    { id: 'shares', label: 'Shares', icon: Share2 },
    { id: 'mappings', label: 'Mappings', icon: Map },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MsgBanner({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) {
    if (!msg) return null;
    return (
        <div className={`text-xs px-3 py-2 rounded flex items-center gap-2 ${
            msg.type === 'success'
                ? 'bg-green-500/10 text-green-700 border border-green-500/30'
                : 'bg-red-500/10 text-red-700 border border-red-500/30'
        }`}>
            {msg.type === 'success' ? <Check className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
            {msg.text}
        </div>
    );
}

// Inline name input shown in place of prompt()
function InlineNameInput({
    placeholder,
    onConfirm,
    onCancel,
}: {
    placeholder: string;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const confirm = () => { if (value.trim()) onConfirm(value.trim()); };

    return (
        <div className="flex items-center gap-1 mt-1 px-2">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') confirm();
                    if (e.key === 'Escape') onCancel();
                }}
                placeholder={placeholder}
                className="h-6 flex-1 text-xs rounded border px-2 bg-background"
            />
            <button onClick={confirm} disabled={!value.trim()} className="text-green-600 hover:text-green-700 disabled:opacity-40">
                <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// Inline delete confirmation — replaces confirm()
function DeleteConfirm({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <span className="flex items-center gap-1 text-[10px] text-destructive">
            {label}
            <button onClick={onConfirm} className="underline hover:no-underline font-medium">Yes</button>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">No</button>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Folder Tree
// ---------------------------------------------------------------------------

function FolderTree({
    folders,
    selectedFolderId,
    onSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
}: {
    folders: DocFolder[];
    selectedFolderId: string | null;
    onSelect: (id: string | null) => void;
    onCreateFolder: (name: string, parentId?: string) => void;
    onRenameFolder: (id: string, name: string) => void;
    onDeleteFolder: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
    const [showRootCreate, setShowRootCreate] = useState(false);

    const toggle = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const renderFolder = (folder: DocFolder, depth: number) => {
        const isExpanded = expanded.has(folder.id);
        const isSelected = selectedFolderId === folder.id;

        return (
            <div key={folder.id}>
                <div
                    className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs group transition-colors ${
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    }`}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => onSelect(folder.id)}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); toggle(folder.id); }}
                        className="p-0.5 shrink-0"
                    >
                        {folder.children && folder.children.length > 0 ? (
                            isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                        ) : (
                            <span className="w-3 h-3 inline-block" />
                        )}
                    </button>
                    {isExpanded
                        ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                        : <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                    }

                    {renamingId === folder.id ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => { if (renameValue.trim()) onRenameFolder(folder.id, renameValue.trim()); setRenamingId(null); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { if (renameValue.trim()) onRenameFolder(folder.id, renameValue.trim()); setRenamingId(null); }
                                if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="flex-1 h-5 text-xs rounded border px-1 bg-background"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="flex-1 truncate">{folder.name}</span>
                    )}

                    {deletingId === folder.id ? (
                        <DeleteConfirm
                            label="Delete?"
                            onConfirm={() => { setDeletingId(null); onDeleteFolder(folder.id); }}
                            onCancel={() => setDeletingId(null)}
                        />
                    ) : (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                            <button
                                onClick={(e) => { e.stopPropagation(); setAddingChildOf(folder.id); setExpanded(p => new Set([...p, folder.id])); }}
                                className="p-0.5 hover:text-primary" title="Add subfolder" type="button"
                            >
                                <FolderPlus className="w-3 h-3" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setRenameValue(folder.name); setRenamingId(folder.id); }}
                                className="p-0.5 hover:text-primary" title="Rename"
                            >
                                <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeletingId(folder.id); }}
                                className="p-0.5 hover:text-destructive" title="Delete"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Inline child folder name input */}
                {addingChildOf === folder.id && (
                    <InlineNameInput
                        placeholder="Subfolder name…"
                        onConfirm={(name) => { setAddingChildOf(null); onCreateFolder(name, folder.id); }}
                        onCancel={() => setAddingChildOf(null)}
                    />
                )}

                {isExpanded && folder.children?.map((child) => renderFolder(child, depth + 1))}
            </div>
        );
    };

    return (
        <div className="space-y-0.5">
            <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                    selectedFolderId === null ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
                onClick={() => onSelect(null)}
            >
                <FileText className="w-3.5 h-3.5" />
                <span className="font-medium">All Notes</span>
            </div>

            {folders.map((f) => renderFolder(f, 0))}

            {showRootCreate ? (
                <InlineNameInput
                    placeholder="Folder name…"
                    onConfirm={(name) => { setShowRootCreate(false); onCreateFolder(name, undefined); }}
                    onCancel={() => setShowRootCreate(false)}
                />
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-6 text-[10px] justify-start gap-1 mt-1"
                    onClick={() => setShowRootCreate(true)}
                >
                    <Plus className="w-3 h-3" /> New Folder
                </Button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Documents Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
    const local = useMatrxLocalContext();
    const { restGet, restPost, restPut, restDelete, status } = local;

    const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    // Auto-clear messages after 4s
    useEffect(() => {
        if (!msg) return;
        const t = setTimeout(() => setMsg(null), 4000);
        return () => clearTimeout(t);
    }, [msg]);

    // ── Folder state ─────────────────────────────────────────────────────────
    const [folders, setFolders] = useState<DocFolder[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

    // ── Notes state ──────────────────────────────────────────────────────────
    const [notes, setNotes] = useState<DocNote[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [selectedNote, setSelectedNote] = useState<DocNote | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

    // ── Sync state ───────────────────────────────────────────────────────────
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

    // ── Versions state ───────────────────────────────────────────────────────
    const [versions, setVersions] = useState<NoteVersion[]>([]);
    const [versionsNoteId, setVersionsNoteId] = useState('');

    // ── Conflicts state ──────────────────────────────────────────────────────
    const [conflicts, setConflicts] = useState<DocConflict[]>([]);

    // ── Local files state ────────────────────────────────────────────────────
    const [localFolders, setLocalFolders] = useState<unknown[]>([]);
    const [localFiles, setLocalFiles] = useState<unknown[]>([]);
    const [localPath, setLocalPath] = useState('');

    // ── Shares state ─────────────────────────────────────────────────────────
    const [shares, setShares] = useState<unknown[]>([]);
    const [deletingShareId, setDeletingShareId] = useState<string | null>(null);

    // ── Mappings state ───────────────────────────────────────────────────────
    const [mappings, setMappings] = useState<unknown[]>([]);
    const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null);

    // ── Create note dialog state ─────────────────────────────────────────────
    const [showCreateNote, setShowCreateNote] = useState(false);
    const [newNoteTitle, setNewNoteTitle] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');

    // ── Data fetchers ────────────────────────────────────────────────────────

    const fetchTree = useCallback(async () => {
        try {
            const data = (await restGet('/documents/tree')) as DocFolder[];
            setFolders(Array.isArray(data) ? data : []);
        } catch {
            setFolders([]);
        }
    }, [restGet]);

    const fetchNotes = useCallback(async () => {
        setLoadingNotes(true);
        try {
            let path = '/documents/notes?';
            if (selectedFolderId) path += `folder_id=${selectedFolderId}&`;
            if (searchQuery) path += `search=${encodeURIComponent(searchQuery)}&`;
            const data = (await restGet(path)) as DocNote[];
            setNotes(Array.isArray(data) ? data : []);
        } catch {
            setNotes([]);
        } finally {
            setLoadingNotes(false);
        }
    }, [restGet, selectedFolderId, searchQuery]);

    // Only fetch once the backend connection is established.
    // restGet/restPost are now stable refs, so these effects fire exactly once on connect.
    useEffect(() => {
        if (status === 'connected') fetchTree();
    }, [status, fetchTree]);

    useEffect(() => {
        if (status === 'connected') fetchNotes();
    }, [status, fetchNotes]);

    // ── Folder CRUD ──────────────────────────────────────────────────────────

    // Called by FolderTree after user types the name inline
    const createFolder = useCallback(async (name: string, parentId?: string) => {
        setBusy(true);
        try {
            await restPost('/documents/folders', { name, parent_id: parentId ?? null });
            await fetchTree();
            setMsg({ type: 'success', text: `Folder "${name}" created` });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create folder' });
        } finally {
            setBusy(false);
        }
    }, [restPost, fetchTree]);

    const renameFolder = useCallback(async (id: string, name: string) => {
        try {
            await restPut(`/documents/folders/${id}`, { name });
            await fetchTree();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Rename failed' });
        }
    }, [restPut, fetchTree]);

    const deleteFolder = useCallback(async (id: string) => {
        try {
            await restDelete(`/documents/folders/${id}`);
            if (selectedFolderId === id) setSelectedFolderId(null);
            await fetchTree();
            setMsg({ type: 'success', text: 'Folder deleted' });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
        }
    }, [restDelete, fetchTree, selectedFolderId]);

    // ── Note CRUD ────────────────────────────────────────────────────────────

    const createNote = async () => {
        if (!newNoteTitle.trim()) return;
        setBusy(true);
        try {
            await restPost('/documents/notes', {
                title: newNoteTitle.trim(),
                content: newNoteContent,
                folder_id: selectedFolderId ?? null,
            });
            setShowCreateNote(false);
            setNewNoteTitle('');
            setNewNoteContent('');
            await fetchNotes();
            setMsg({ type: 'success', text: 'Note created' });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create note' });
        } finally {
            setBusy(false);
        }
    };

    const selectNote = (note: DocNote) => {
        setSelectedNote(note);
        setEditTitle(note.title);
        setEditContent(note.content || '');
        setShowCreateNote(false);
    };

    const saveNote = async () => {
        if (!selectedNote) return;
        setBusy(true);
        try {
            await restPut(`/documents/notes/${selectedNote.id}`, { title: editTitle, content: editContent });
            await fetchNotes();
            setMsg({ type: 'success', text: 'Note saved' });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
        } finally {
            setBusy(false);
        }
    };

    const deleteNote = async (id: string) => {
        try {
            await restDelete(`/documents/notes/${id}`);
            if (selectedNote?.id === id) setSelectedNote(null);
            setDeletingNoteId(null);
            await fetchNotes();
            setMsg({ type: 'success', text: 'Note deleted' });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
        }
    };

    // ── Sync ─────────────────────────────────────────────────────────────────

    const fetchSyncStatus = async () => {
        try {
            const data = (await restGet('/documents/sync/status')) as SyncStatus;
            setSyncStatus(data);
        } catch { setSyncStatus(null); }
    };

    const triggerSync = async () => {
        setBusy(true);
        try {
            const res = await restPost('/documents/sync/trigger');
            setMsg({ type: 'success', text: `Sync triggered: ${JSON.stringify(res)}` });
            await fetchSyncStatus();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed' });
        } finally { setBusy(false); }
    };

    const pullChanges = async () => {
        setBusy(true);
        try {
            const res = await restPost('/documents/sync/pull');
            setMsg({ type: 'success', text: `Pull complete: ${JSON.stringify(res)}` });
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Pull failed' });
        } finally { setBusy(false); }
    };

    // ── Versions ─────────────────────────────────────────────────────────────

    const fetchVersions = async (noteId: string) => {
        setVersionsNoteId(noteId);
        try {
            const data = (await restGet(`/documents/notes/${noteId}/versions`)) as NoteVersion[];
            setVersions(Array.isArray(data) ? data : []);
        } catch { setVersions([]); }
    };

    const revertToVersion = async (noteId: string, versionId: string) => {
        setBusy(true);
        try {
            await restPost(`/documents/notes/${noteId}/revert`, { version_id: versionId });
            setMsg({ type: 'success', text: 'Reverted to version' });
            await fetchNotes();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Revert failed' });
        } finally { setBusy(false); }
    };

    // ── Conflicts ────────────────────────────────────────────────────────────

    const fetchConflicts = async () => {
        try {
            const data = (await restGet('/documents/conflicts')) as DocConflict[];
            setConflicts(Array.isArray(data) ? data : []);
        } catch { setConflicts([]); }
    };

    const resolveConflict = async (conflictId: string, resolution: 'local' | 'remote') => {
        setBusy(true);
        try {
            await restPost(`/documents/conflicts/${conflictId}/resolve`, { resolution });
            setMsg({ type: 'success', text: `Conflict resolved (${resolution})` });
            await fetchConflicts();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Resolve failed' });
        } finally { setBusy(false); }
    };

    // ── Local files ──────────────────────────────────────────────────────────

    const fetchLocalFiles = async () => {
        try {
            const [foldersData, filesData] = await Promise.all([
                restGet(`/documents/local/folders${localPath ? `?path=${encodeURIComponent(localPath)}` : ''}`) as Promise<unknown[]>,
                restGet(`/documents/local/files${localPath ? `?path=${encodeURIComponent(localPath)}` : ''}`) as Promise<unknown[]>,
            ]);
            setLocalFolders(Array.isArray(foldersData) ? foldersData : []);
            setLocalFiles(Array.isArray(filesData) ? filesData : []);
        } catch {
            setLocalFolders([]);
            setLocalFiles([]);
        }
    };

    // ── Shares ───────────────────────────────────────────────────────────────

    const fetchShares = async () => {
        try {
            const data = (await restGet('/documents/shares')) as unknown[];
            setShares(Array.isArray(data) ? data : []);
        } catch { setShares([]); }
    };

    const deleteShare = async (id: string) => {
        try {
            await restDelete(`/documents/shares/${id}`);
            setDeletingShareId(null);
            await fetchShares();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
        }
    };

    // ── Mappings ─────────────────────────────────────────────────────────────

    const fetchMappings = async () => {
        try {
            const data = (await restGet('/documents/mappings')) as unknown[];
            setMappings(Array.isArray(data) ? data : []);
        } catch { setMappings([]); }
    };

    const deleteMapping = async (id: string) => {
        try {
            await restDelete(`/documents/mappings/${id}`);
            setDeletingMappingId(null);
            await fetchMappings();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
        }
    };

    // ── Tab auto-fetch ───────────────────────────────────────────────────────

    useEffect(() => {
        if (activeTab === 'sync') fetchSyncStatus();
        if (activeTab === 'conflicts') fetchConflicts();
        if (activeTab === 'local') fetchLocalFiles();
        if (activeTab === 'shares') fetchShares();
        if (activeTab === 'mappings') fetchMappings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-screen-2xl mx-auto space-y-4">

                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <Link href="/demos/local-tools">
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <FileText className="w-5 h-5" /> Documents & Notes
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Folders, notes, sync, versions, conflicts
                            </p>
                        </div>
                    </div>

                    <ConnectionBar hook={local} />
                    <MsgBanner msg={msg} />

                    {/* Tabs */}
                    <div className="flex gap-1 border-b overflow-x-auto">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                                        activeTab === tab.id
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Notes Tab ─────────────────────────────────────────── */}
                    {activeTab === 'notes' && (
                        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_1fr] gap-4">

                            {/* Folder sidebar */}
                            <div className="border rounded-lg p-2 bg-card overflow-y-auto max-h-[60vh]">
                                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                                    Folders
                                </h3>
                                <FolderTree
                                    folders={folders}
                                    selectedFolderId={selectedFolderId}
                                    onSelect={setSelectedFolderId}
                                    onCreateFolder={createFolder}
                                    onRenameFolder={renameFolder}
                                    onDeleteFolder={deleteFolder}
                                />
                            </div>

                            {/* Note list */}
                            <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
                                <div className="p-2 border-b space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-2 top-1.5 w-3 h-3 text-muted-foreground" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search notes..."
                                                className="h-6 w-full pl-6 text-xs rounded border px-2 bg-background"
                                            />
                                        </div>
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={fetchNotes} disabled={loadingNotes}>
                                            {loadingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        </Button>
                                        <Button size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => setShowCreateNote(true)}>
                                            <FilePlus className="w-3 h-3" /> New
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto max-h-[50vh]">
                                    {notes.length === 0 ? (
                                        <p className="text-xs text-muted-foreground p-3 text-center italic">No notes found</p>
                                    ) : (
                                        notes.map((note) => (
                                            <div
                                                key={note.id}
                                                onClick={() => selectNote(note)}
                                                className={`px-3 py-2 border-b cursor-pointer transition-colors group ${
                                                    selectedNote?.id === note.id ? 'bg-accent' : 'hover:bg-accent/50'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium truncate">{note.title}</span>
                                                    <div className="hidden group-hover:flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); fetchVersions(note.id); setActiveTab('versions'); }}
                                                            className="p-0.5 hover:text-primary" title="Versions"
                                                        >
                                                            <GitBranch className="w-3 h-3" />
                                                        </button>
                                                        {deletingNoteId === note.id ? (
                                                            <DeleteConfirm
                                                                label="Delete?"
                                                                onConfirm={() => deleteNote(note.id)}
                                                                onCancel={() => setDeletingNoteId(null)}
                                                            />
                                                        ) : (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setDeletingNoteId(note.id); }}
                                                                className="p-0.5 hover:text-destructive" title="Delete"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {note.updated_at && (
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        {new Date(note.updated_at).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Note editor */}
                            <div className="border rounded-lg p-3 bg-card space-y-2">
                                {selectedNote ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-semibold">Edit Note</h3>
                                            <Button size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={saveNote} disabled={busy}>
                                                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                Save
                                            </Button>
                                        </div>
                                        <input
                                            type="text"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="h-7 w-full text-xs font-medium rounded border px-2 bg-background"
                                            placeholder="Note title"
                                        />
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="w-full h-[40vh] text-xs font-mono rounded border p-2 bg-background resize-y"
                                            placeholder="Note content..."
                                            spellCheck={false}
                                        />
                                        <p className="text-[10px] text-muted-foreground">ID: {selectedNote.id}</p>
                                    </>
                                ) : showCreateNote ? (
                                    <>
                                        <h3 className="text-xs font-semibold">Create Note</h3>
                                        <input
                                            type="text"
                                            value={newNoteTitle}
                                            onChange={(e) => setNewNoteTitle(e.target.value)}
                                            className="h-7 w-full text-xs rounded border px-2 bg-background"
                                            placeholder="Title"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && createNote()}
                                        />
                                        <textarea
                                            value={newNoteContent}
                                            onChange={(e) => setNewNoteContent(e.target.value)}
                                            className="w-full h-40 text-xs font-mono rounded border p-2 bg-background resize-y"
                                            placeholder="Content..."
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" className="h-6 text-[10px] px-3" onClick={createNote} disabled={busy || !newNoteTitle.trim()}>
                                                {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                                                Create
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-3" onClick={() => setShowCreateNote(false)}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic p-4 text-center">
                                        Select a note to edit, or click New
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Sync Tab ──────────────────────────────────────────── */}
                    {activeTab === 'sync' && (
                        <div className="border rounded-lg p-4 bg-card space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4" /> Sync Status
                                </h2>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1" onClick={fetchSyncStatus}>
                                    <RefreshCw className="w-3 h-3" /> Refresh
                                </Button>
                            </div>
                            {syncStatus ? (
                                <pre className="text-xs font-mono bg-background border rounded p-3 overflow-x-auto">
                                    {JSON.stringify(syncStatus, null, 2)}
                                </pre>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">No sync status available</p>
                            )}
                            <div className="flex gap-3">
                                <Button size="sm" className="h-8 text-xs px-3 gap-1.5" onClick={triggerSync} disabled={busy}>
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    Trigger Full Sync
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 text-xs px-3 gap-1.5" onClick={pullChanges} disabled={busy}>
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Pull Changes
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Versions Tab ──────────────────────────────────────── */}
                    {activeTab === 'versions' && (
                        <div className="border rounded-lg p-4 bg-card space-y-3">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Note Version History
                            </h2>
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-xs text-muted-foreground block mb-1">Note ID</label>
                                    <input
                                        type="text"
                                        value={versionsNoteId}
                                        onChange={(e) => setVersionsNoteId(e.target.value)}
                                        className="h-7 w-full text-xs font-mono rounded border px-2 bg-background"
                                        placeholder="Enter note ID..."
                                        onKeyDown={(e) => e.key === 'Enter' && versionsNoteId && fetchVersions(versionsNoteId)}
                                    />
                                </div>
                                <Button size="sm" className="h-7 text-xs px-3" onClick={() => versionsNoteId && fetchVersions(versionsNoteId)} disabled={!versionsNoteId}>
                                    Load Versions
                                </Button>
                            </div>
                            {versions.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No versions loaded</p>
                            ) : (
                                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                                    {versions.map((v, i) => (
                                        <div key={v.version_id || i} className="border rounded p-2 bg-background">
                                            <div className="flex items-center justify-between mb-1">
                                                <Badge variant="outline" className="text-[10px]">{v.version_id}</Badge>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                                                    </span>
                                                    <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 gap-1"
                                                        onClick={() => revertToVersion(versionsNoteId, v.version_id)} disabled={busy}>
                                                        <RotateCcw className="w-2.5 h-2.5" /> Revert
                                                    </Button>
                                                </div>
                                            </div>
                                            <pre className="text-[10px] font-mono max-h-24 overflow-y-auto whitespace-pre-wrap">
                                                {v.content?.slice(0, 500) || '(empty)'}
                                                {v.content && v.content.length > 500 && '…'}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Conflicts Tab ─────────────────────────────────────── */}
                    {activeTab === 'conflicts' && (
                        <div className="border rounded-lg p-4 bg-card space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-500" /> Conflicts
                                </h2>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1" onClick={fetchConflicts}>
                                    <RefreshCw className="w-3 h-3" /> Refresh
                                </Button>
                            </div>
                            {conflicts.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No conflicts — everything in sync ✓</p>
                            ) : (
                                <div className="space-y-3">
                                    {conflicts.map((c) => (
                                        <div key={c.id} className="border rounded p-3 bg-background space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-mono">Note: {c.note_id}</span>
                                                <Badge variant="outline" className="text-[10px]">{c.id}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">Local</p>
                                                    <pre className="text-[10px] font-mono bg-card border rounded p-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{c.local_content || '(empty)'}</pre>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">Remote</p>
                                                    <pre className="text-[10px] font-mono bg-card border rounded p-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{c.remote_content || '(empty)'}</pre>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => resolveConflict(c.id, 'local')} disabled={busy}>Keep Local</Button>
                                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => resolveConflict(c.id, 'remote')} disabled={busy}>Keep Remote</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Local Files Tab ───────────────────────────────────── */}
                    {activeTab === 'local' && (
                        <div className="border rounded-lg p-4 bg-card space-y-3">
                            <h2 className="text-sm font-semibold flex items-center gap-2"><HardDrive className="w-4 h-4" /> Local File Browser</h2>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={localPath}
                                    onChange={(e) => setLocalPath(e.target.value)}
                                    placeholder="Path (leave empty for root)"
                                    className="h-7 flex-1 text-xs font-mono rounded border px-2 bg-background"
                                    onKeyDown={(e) => e.key === 'Enter' && fetchLocalFiles()}
                                />
                                <Button size="sm" className="h-7 text-xs px-3" onClick={fetchLocalFiles}>Browse</Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <h3 className="text-xs font-semibold text-muted-foreground mb-1">Folders ({localFolders.length})</h3>
                                    <pre className="text-[10px] font-mono bg-background border rounded p-2 max-h-48 overflow-y-auto">{JSON.stringify(localFolders, null, 2)}</pre>
                                </div>
                                <div>
                                    <h3 className="text-xs font-semibold text-muted-foreground mb-1">Files ({localFiles.length})</h3>
                                    <pre className="text-[10px] font-mono bg-background border rounded p-2 max-h-48 overflow-y-auto">{JSON.stringify(localFiles, null, 2)}</pre>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Shares Tab ────────────────────────────────────────── */}
                    {activeTab === 'shares' && (
                        <div className="border rounded-lg p-4 bg-card space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    <Share2 className="w-4 h-4" /> Shares
                                    <Badge variant="outline" className="text-[10px]">/documents/shares</Badge>
                                </h2>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1" onClick={fetchShares}>
                                    <RefreshCw className="w-3 h-3" /> Refresh
                                </Button>
                            </div>
                            {shares.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No shares</p>
                            ) : (
                                <div className="space-y-2">
                                    {shares.map((s: unknown, i: number) => {
                                        const share = s as Record<string, unknown>;
                                        const id = share.id as string;
                                        return (
                                            <div key={id || i} className="flex items-center justify-between border rounded p-2 bg-background">
                                                <pre className="text-[10px] font-mono flex-1 overflow-hidden">{JSON.stringify(share, null, 2)}</pre>
                                                {id && (
                                                    deletingShareId === id ? (
                                                        <DeleteConfirm label="Delete?" onConfirm={() => deleteShare(id)} onCancel={() => setDeletingShareId(null)} />
                                                    ) : (
                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive shrink-0 ml-2" onClick={() => setDeletingShareId(id)}>
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="border-t pt-3 space-y-2">
                                <h3 className="text-xs font-semibold">Create Share</h3>
                                <ShareCreateForm restPost={restPost} onCreated={fetchShares} setMsg={setMsg} />
                            </div>
                        </div>
                    )}

                    {/* ── Mappings Tab ──────────────────────────────────────── */}
                    {activeTab === 'mappings' && (
                        <div className="border rounded-lg p-4 bg-card space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    <Link2 className="w-4 h-4" /> Directory Mappings
                                    <Badge variant="outline" className="text-[10px]">/documents/mappings</Badge>
                                </h2>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2 gap-1" onClick={fetchMappings}>
                                    <RefreshCw className="w-3 h-3" /> Refresh
                                </Button>
                            </div>
                            {mappings.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No mappings configured</p>
                            ) : (
                                <div className="space-y-2">
                                    {mappings.map((m: unknown, i: number) => {
                                        const mapping = m as Record<string, unknown>;
                                        const id = mapping.id as string;
                                        return (
                                            <div key={id || i} className="flex items-center justify-between border rounded p-2 bg-background">
                                                <pre className="text-[10px] font-mono flex-1 overflow-hidden">{JSON.stringify(mapping, null, 2)}</pre>
                                                {id && (
                                                    deletingMappingId === id ? (
                                                        <DeleteConfirm label="Delete?" onConfirm={() => deleteMapping(id)} onCancel={() => setDeletingMappingId(null)} />
                                                    ) : (
                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive shrink-0 ml-2" onClick={() => setDeletingMappingId(id)}>
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="border-t pt-3 space-y-2">
                                <h3 className="text-xs font-semibold">Create Mapping</h3>
                                <MappingCreateForm restPost={restPost} onCreated={fetchMappings} setMsg={setMsg} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inline forms
// ---------------------------------------------------------------------------

function ShareCreateForm({
    restPost,
    onCreated,
    setMsg,
}: {
    restPost: (path: string, body?: unknown) => Promise<unknown>;
    onCreated: () => void;
    setMsg: (m: { type: 'success' | 'error'; text: string }) => void;
}) {
    const [json, setJson] = useState('{\n  "resource_type": "note",\n  "resource_id": "",\n  "shared_with": "",\n  "permissions": "read"\n}');
    const [busy, setBusy] = useState(false);

    const create = async () => {
        setBusy(true);
        try {
            const body = JSON.parse(json);
            await restPost('/documents/shares', body);
            setMsg({ type: 'success', text: 'Share created' });
            onCreated();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-2">
            <textarea value={json} onChange={(e) => setJson(e.target.value)}
                className="w-full h-28 text-xs font-mono rounded border p-2 bg-background resize-y" spellCheck={false} />
            <Button size="sm" className="h-6 text-[10px] px-3" onClick={create} disabled={busy}>
                {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Create Share
            </Button>
        </div>
    );
}

function MappingCreateForm({
    restPost,
    onCreated,
    setMsg,
}: {
    restPost: (path: string, body?: unknown) => Promise<unknown>;
    onCreated: () => void;
    setMsg: (m: { type: 'success' | 'error'; text: string }) => void;
}) {
    const [localPath, setLocalPath] = useState('');
    const [remotePath, setRemotePath] = useState('');
    const [busy, setBusy] = useState(false);

    const create = async () => {
        setBusy(true);
        try {
            await restPost('/documents/mappings', { local_path: localPath, remote_path: remotePath });
            setMsg({ type: 'success', text: 'Mapping created' });
            setLocalPath('');
            setRemotePath('');
            onCreated();
        } catch (err) {
            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
        } finally { setBusy(false); }
    };

    return (
        <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Local Path</label>
                <input type="text" value={localPath} onChange={(e) => setLocalPath(e.target.value)}
                    className="h-6 w-full text-xs font-mono rounded border px-1.5 bg-background" placeholder="/path/to/local" />
            </div>
            <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Remote Path</label>
                <input type="text" value={remotePath} onChange={(e) => setRemotePath(e.target.value)}
                    className="h-6 w-full text-xs font-mono rounded border px-1.5 bg-background" placeholder="/path/to/remote" />
            </div>
            <Button size="sm" className="h-6 text-[10px] px-3" onClick={create} disabled={busy || !localPath}>
                {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Create
            </Button>
        </div>
    );
}
