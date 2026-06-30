// features/notes/components/NoteTabs.tsx
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, FileText, Copy, Share2, Trash2, Plus, Save, PilcrowRight, Eye, SplitSquareHorizontal, XCircle, FolderInput, Edit3, Download, Columns } from 'lucide-react';
import { useNotesRedux } from '../hooks/useNotesRedux';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AdvancedMenu, { MenuItem } from '@/components/official/AdvancedMenu';
import type { Note } from '../types';
import { getNoteMetadata } from '../types';

type EditorMode = 'plain' | 'wysiwyg' | 'markdown' | 'matrx-split' | 'preview';

interface NoteTabsProps {
    onCreateNote: (folderName?: string) => void;
    onDeleteNote: (noteId: string) => void;
    onCopyNote: (noteId: string) => void;
    onShareNote: (noteId: string) => void;
    onUpdateNote: (noteId: string, updates: any) => void;
    onSaveNote: () => void;
    isDirty: boolean;
    isSaving: boolean;
}

export function NoteTabs({ 
    onCreateNote, 
    onDeleteNote, 
    onCopyNote, 
    onShareNote,
    onUpdateNote,
    onSaveNote,
    isDirty,
    isSaving
}: NoteTabsProps) {
    const { notes, openTabs, activeNote, openNoteInTab, closeTab, reorderTabs, closeAllTabs } = useNotesRedux();
    const activeTabRef = useRef<HTMLDivElement>(null);
    const [draggedTab, setDraggedTab] = useState<string | null>(null);
    const [dragOverTab, setDragOverTab] = useState<string | null>(null);
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuNoteId, setContextMenuNoteId] = useState<string | null>(null);
    const [localLabels, setLocalLabels] = useState<Record<string, string>>({});
    const labelSaveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

    // Auto-scroll to active tab when it changes
    useEffect(() => {
        if (activeTabRef.current) {
            activeTabRef.current.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeNote?.id]);

    // Initialize local labels when notes change
    useEffect(() => {
        const labels: Record<string, string> = {};
        notes.forEach(note => {
            labels[note.id] = note.label;
        });
        setLocalLabels(labels);
    }, [notes]);

    const handleTabClick = (noteId: string) => {
        openNoteInTab(noteId);
    };

    const handleCloseTab = (e: React.MouseEvent, noteId: string) => {
        e.stopPropagation();
        closeTab(noteId);
    };

    // Debounced label change - only updates local state immediately, saves after pause
    const handleLabelChange = useCallback((noteId: string, newLabel: string) => {
        // Update local state immediately for responsive UI
        setLocalLabels(prev => ({ ...prev, [noteId]: newLabel }));
        
        // Clear existing timeout for this note
        if (labelSaveTimeoutRef.current[noteId]) {
            clearTimeout(labelSaveTimeoutRef.current[noteId]);
        }
        
        // Schedule save after 500ms of no typing
        labelSaveTimeoutRef.current[noteId] = setTimeout(() => {
            onUpdateNote(noteId, { label: newLabel });
            delete labelSaveTimeoutRef.current[noteId];
        }, 500);
    }, [onUpdateNote]);

    // Save label immediately on blur
    const handleLabelBlur = useCallback((noteId: string) => {
        if (labelSaveTimeoutRef.current[noteId]) {
            clearTimeout(labelSaveTimeoutRef.current[noteId]);
            delete labelSaveTimeoutRef.current[noteId];
            const label = localLabels[noteId];
            if (label !== undefined) {
                onUpdateNote(noteId, { label });
            }
        }
    }, [localLabels, onUpdateNote]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            Object.values(labelSaveTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
        };
    }, []);

    const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
        e.stopPropagation();
        // Select all text for easy editing
        (e.target as HTMLInputElement).select();
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, noteId: string) => {
        setDraggedTab(noteId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, noteId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTab(noteId);
    };

    const handleDragLeave = () => {
        setDragOverTab(null);
    };

    const handleDrop = (e: React.DragEvent, targetNoteId: string) => {
        e.preventDefault();
        if (!draggedTab || draggedTab === targetNoteId) return;

        // Reorder tabs
        const draggedIndex = openTabs.indexOf(draggedTab);
        const targetIndex = openTabs.indexOf(targetNoteId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;

        const newTabs = [...openTabs];
        newTabs.splice(draggedIndex, 1);
        newTabs.splice(targetIndex, 0, draggedTab);

        // Update tab order in context
        reorderTabs(newTabs);
        
        setDraggedTab(null);
        setDragOverTab(null);
    };

    const handleDragEnd = () => {
        setDraggedTab(null);
        setDragOverTab(null);
    };

    // Get current editor mode from active note
    const getCurrentMode = (note: Note): EditorMode => {
        return (getNoteMetadata(note).lastEditorMode as EditorMode) || 'plain';
    };

    // Get icon for current mode
    const getModeIcon = (mode: EditorMode) => {
        switch (mode) {
            case 'plain': return FileText;
            case 'wysiwyg': return PilcrowRight;
            case 'markdown': return SplitSquareHorizontal;
            case 'matrx-split': return Columns;
            case 'preview': return Eye;
            default: return FileText;
        }
    };

    // Handle view mode change
    const handleViewModeChange = (mode: EditorMode) => {
        if (activeNote) {
            onUpdateNote(activeNote.id, {
                metadata: { ...getNoteMetadata(activeNote), lastEditorMode: mode }
            });
        }
        setViewMenuOpen(false);
    };

    // View mode menu items
    const getViewMenuItems = (currentMode: EditorMode): MenuItem[] => [
        {
            key: 'plain',
            icon: FileText,
            label: 'Plain Text',
            description: 'Simple text editor',
            action: () => handleViewModeChange('plain'),
            iconColor: currentMode === 'plain' ? 'text-primary' : undefined,
        },
        {
            key: 'wysiwyg',
            icon: PilcrowRight,
            label: 'Rich Editor',
            description: 'WYSIWYG editor',
            action: () => handleViewModeChange('wysiwyg'),
            iconColor: currentMode === 'wysiwyg' ? 'text-primary' : undefined,
        },
        {
            key: 'markdown',
            icon: SplitSquareHorizontal,
            label: 'Split View',
            description: 'Markdown with preview',
            action: () => handleViewModeChange('markdown'),
            iconColor: currentMode === 'markdown' ? 'text-primary' : undefined,
        },
        {
            key: 'matrx-split',
            icon: Columns,
            label: 'Matrx Split',
            description: 'Editor + Matrx preview',
            action: () => handleViewModeChange('matrx-split'),
            iconColor: currentMode === 'matrx-split' ? 'text-primary' : undefined,
        },
        {
            key: 'preview',
            icon: Eye,
            label: 'Preview',
            description: 'Read-only preview',
            action: () => handleViewModeChange('preview'),
            iconColor: currentMode === 'preview' ? 'text-primary' : undefined,
        },
    ];

    // Tab context menu items
    const getTabContextMenuItems = (noteId: string): MenuItem[] => {
        const note = notes.find(n => n.id === noteId);
        if (!note) return [];

        const isActive = activeNote?.id === noteId;
        const tabIndex = openTabs.indexOf(noteId);
        const otherTabsCount = openTabs.length - 1;

        return [
            {
                key: 'save',
                icon: Save,
                label: 'Save Note',
                description: 'Save current changes',
                action: () => {
                    if (isActive) {
                        onSaveNote();
                    }
                },
                disabled: !isActive || !isDirty,
                category: 'Actions',
            },
            {
                key: 'duplicate',
                icon: Copy,
                label: 'Duplicate Note',
                description: 'Create a copy of this note',
                action: () => onCopyNote(noteId),
                category: 'Actions',
            },
            {
                key: 'share',
                icon: Share2,
                label: 'Share Note',
                description: 'Share with others',
                action: () => onShareNote(noteId),
                category: 'Actions',
            },
            {
                key: 'download',
                icon: Download,
                label: 'Export Note',
                description: 'Download as markdown',
                action: async () => {
                    const blob = new Blob([note.content ?? ""], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${note.label}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                },
                category: 'Actions',
            },
            {
                key: 'close',
                icon: X,
                label: 'Close Tab',
                description: 'Close this tab',
                action: () => closeTab(noteId),
                category: 'Tab',
            },
            {
                key: 'close-others',
                icon: XCircle,
                label: 'Close Other Tabs',
                description: `Close ${otherTabsCount} other tab${otherTabsCount !== 1 ? 's' : ''}`,
                action: () => {
                    openTabs.forEach(id => {
                        if (id !== noteId) closeTab(id);
                    });
                },
                disabled: otherTabsCount === 0,
                category: 'Tab',
            },
            {
                key: 'close-all',
                icon: XCircle,
                label: 'Close All Tabs',
                description: 'Close all open tabs',
                action: () => closeAllTabs(),
                category: 'Tab',
            },
            {
                key: 'delete',
                icon: Trash2,
                label: 'Delete Note',
                description: 'Permanently delete this note',
                action: () => onDeleteNote(noteId),
                iconColor: 'text-destructive',
                category: 'Danger',
            },
        ];
    };

    // Handle tab context menu
    const handleTabContextMenu = (e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuNoteId(noteId);
        setContextMenuOpen(true);
    };

    return (
        <div className="border-b border-border bg-muted hidden md:block">
            <ScrollArea className="w-full">
                <div className="flex items-center px-2 py-1 gap-1">
                    {/* Tabs */}
                    {openTabs.map((noteId) => {
                        const note = notes.find(n => n.id === noteId);
                        if (!note) return null;

                        const isActive = activeNote?.id === noteId;
                        const isBeingDragged = draggedTab === noteId;
                        const isDragOver = dragOverTab === noteId;

                        const currentMode = getCurrentMode(note);
                        const ModeIcon = getModeIcon(currentMode);

                        return (
                            <div
                                key={noteId}
                                ref={isActive ? activeTabRef : null}
                                draggable
                                onDragStart={(e) => handleDragStart(e, noteId)}
                                onDragOver={(e) => handleDragOver(e, noteId)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, noteId)}
                                onDragEnd={handleDragEnd}
                                onContextMenu={(e) => handleTabContextMenu(e, noteId)}
                                className={cn(
                                    "group flex items-center gap-1.5 px-2 py-1 rounded-t border-b-2 transition-all flex-shrink-0 cursor-move",
                                    "min-w-[200px] max-w-[400px]",
                                    isActive
                                        ? "bg-card border-primary"
                                        : "bg-transparent border-transparent hover:bg-accent",
                                    isBeingDragged && "opacity-50",
                                    isDragOver && "border-primary/50"
                                )}
                            >
                                {/* View Mode Icon - clickable on active tab */}
                                {isActive ? (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewMenuOpen(true);
                                        }}
                                        className="flex-shrink-0 cursor-pointer hover:bg-accent rounded p-0.5 transition-colors"
                                    >
                                        <ModeIcon className="h-3.5 w-3.5 text-foreground" />
                                    </div>
                                ) : (
                                    <ModeIcon 
                                        className="flex-shrink-0 h-3.5 w-3.5 text-muted-foreground cursor-pointer"
                                        onClick={() => handleTabClick(noteId)}
                                    />
                                )}
                                
                                {isActive ? (
                                    <input
                                        type="text"
                                        value={localLabels[noteId] ?? note.label}
                                        onChange={(e) => handleLabelChange(noteId, e.target.value)}
                                        onBlur={() => handleLabelBlur(noteId)}
                                        onClick={handleInputClick}
                                        className="flex-1 h-6 text-xs bg-transparent px-1 outline-none border-none text-foreground"
                                        style={{ boxShadow: 'none' }}
                                    />
                                ) : (
                                    <span 
                                        className="flex-1 text-xs font-medium truncate cursor-pointer text-muted-foreground"
                                        onClick={() => handleTabClick(noteId)}
                                    >
                                        {localLabels[noteId] ?? note.label}
                                    </span>
                                )}

                                {/* Action buttons area */}
                                <div className="flex items-center gap-0.5">
                                    {/* Full actions - ONLY on active tab */}
                                    {isActive && (
                                        <>
                                            {/* Save button - ALWAYS visible on active tab */}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!isSaving) onSaveNote();
                                                            }}
                                                            className={cn(
                                                                "flex items-center justify-center h-5 w-5 rounded transition-colors",
                                                                isSaving 
                                                                    ? "cursor-wait bg-warning/10" 
                                                                    : isDirty 
                                                                        ? "cursor-pointer hover:bg-success/10" 
                                                                        : "cursor-pointer hover:bg-accent"
                                                            )}
                                                        >
                                                            <Save className={cn(
                                                                "h-3 w-3",
                                                                isSaving 
                                                                    ? "text-warning animate-pulse" 
                                                                    : isDirty
                                                                        ? "text-success"
                                                                        : "text-muted-foreground"
                                                            )} />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {isSaving ? 'Saving...' : isDirty ? 'Save changes' : 'Save note'}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onCopyNote(noteId);
                                                            }}
                                                            className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent transition-colors cursor-pointer"
                                                        >
                                                            <Copy className="h-3 w-3 text-muted-foreground" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Duplicate</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onShareNote(noteId);
                                                            }}
                                                            className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent transition-colors cursor-pointer"
                                                        >
                                                            <Share2 className="h-3 w-3 text-muted-foreground" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Share</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteNote(noteId);
                                                            }}
                                                            className="flex items-center justify-center h-5 w-5 rounded hover:bg-destructive/10 transition-colors cursor-pointer"
                                                        >
                                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Delete</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </>
                                    )}

                                    {/* Close button - visible on hover for inactive, always visible for active */}
                                    <div
                                        onClick={(e) => handleCloseTab(e, noteId)}
                                        className={cn(
                                            "flex items-center justify-center h-5 w-5 rounded hover:bg-accent transition-all cursor-pointer",
                                            isActive ? "ml-0.5" : "",
                                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                        )}
                                        title="Close tab"
                                    >
                                        <X className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* New tab button */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    onClick={() => onCreateNote(activeNote?.folder_name ?? undefined)}
                                    className="flex items-center justify-center h-7 w-7 ml-0.5 rounded hover:bg-accent transition-colors cursor-pointer flex-shrink-0 self-center"
                                >
                                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>New note{activeNote?.folder_name ? ` in ${activeNote.folder_name}` : ''}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <ScrollBar orientation="horizontal" className="h-1.5" />
            </ScrollArea>

            {/* View Mode Menu */}
            {activeNote && (
                <AdvancedMenu
                    isOpen={viewMenuOpen}
                    onClose={() => setViewMenuOpen(false)}
                    items={getViewMenuItems(getCurrentMode(activeNote))}
                    title="Editor View"
                    description="Choose your editing mode"
                    position="center"
                    width="280px"
                    closeOnAction={true}
                />
            )}

            {/* Tab Context Menu */}
            {contextMenuNoteId && (
                <AdvancedMenu
                    isOpen={contextMenuOpen}
                    onClose={() => {
                        setContextMenuOpen(false);
                        setContextMenuNoteId(null);
                    }}
                    items={getTabContextMenuItems(contextMenuNoteId)}
                    title="Note Actions"
                    description={notes.find(n => n.id === contextMenuNoteId)?.label}
                    position="center"
                    width="280px"
                    closeOnAction={true}
                    categorizeItems={true}
                />
            )}
        </div>
    );
}

