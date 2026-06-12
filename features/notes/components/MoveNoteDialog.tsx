// features/notes/components/MoveNoteDialog.tsx
"use client";

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderInput, FolderOpen } from 'lucide-react';
import { getFolderIconAndColor } from '../utils/folderUtils';
import { cn } from '@/lib/utils';

interface MoveNoteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (targetFolder: string) => void;
    noteName: string;
    currentFolder: string;
    availableFolders: string[];
}

export function MoveNoteDialog({
    open,
    onOpenChange,
    onConfirm,
    noteName,
    currentFolder,
    availableFolders,
}: MoveNoteDialogProps) {
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

    // Reset selection when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedFolder(null);
        }
    }, [open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedFolder) {
            return;
        }

        if (selectedFolder === currentFolder) {
            onOpenChange(false);
            return;
        }
        
        onConfirm(selectedFolder);
        setSelectedFolder(null);
        onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setSelectedFolder(null);
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[85dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderInput className="h-5 w-5 text-primary" />
                        Move Note
                    </DialogTitle>
                    <DialogDescription>
                        Move "{noteName}" to a different folder.
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 overflow-hidden">
                    <div className="grid gap-2 flex-1 overflow-hidden">
                        <Label>Select Target Folder</Label>
                        <ScrollArea className="flex-1 pr-2 border rounded-lg p-2 max-h-[400px]">
                            <div className="space-y-1">
                                {availableFolders.map((folder) => {
                                    const { icon: FolderIcon, color: iconColor } = getFolderIconAndColor(folder);
                                    const isSelected = selectedFolder === folder;
                                    const isCurrent = folder === currentFolder;
                                    
                                    return (
                                        <button
                                            key={folder}
                                            type="button"
                                            onClick={() => setSelectedFolder(folder)}
                                            disabled={isCurrent}
                                            className={cn(
                                                "w-full flex items-center gap-2 p-2 rounded-md text-left transition-all text-sm",
                                                "hover:bg-accent",
                                                isSelected && "bg-primary/10 border border-primary",
                                                isCurrent && "opacity-50 cursor-not-allowed"
                                            )}
                                        >
                                            <FolderIcon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
                                            <span className="flex-1 truncate">{folder}</span>
                                            {isCurrent && (
                                                <span className="text-xs text-muted-foreground">(Current)</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!selectedFolder || selectedFolder === currentFolder}>
                            Move Note
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

