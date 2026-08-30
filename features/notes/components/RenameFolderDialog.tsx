// features/notes/components/RenameFolderDialog.tsx
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
import { Input } from '@ai-matrx/design-system';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FolderOpen } from 'lucide-react';

interface RenameFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (newName: string) => void;
    currentName: string;
    existingFolders: string[];
}

export function RenameFolderDialog({
    open,
    onOpenChange,
    onConfirm,
    currentName,
    existingFolders,
}: RenameFolderDialogProps) {
    const [folderName, setFolderName] = useState(currentName);
    const [error, setError] = useState('');

    // Update folder name when dialog opens with new folder
    useEffect(() => {
        if (open) {
            setFolderName(currentName);
            setError('');
        }
    }, [open, currentName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const trimmedName = folderName.trim();
        
        if (!trimmedName) {
            setError('Folder name cannot be empty');
            return;
        }

        if (trimmedName === currentName) {
            setError('Please enter a different name');
            return;
        }
        
        if (existingFolders.includes(trimmedName)) {
            setError('A folder with this name already exists');
            return;
        }
        
        onConfirm(trimmedName);
        setFolderName('');
        setError('');
        onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setFolderName(currentName);
            setError('');
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-primary" />
                        Rename Folder
                    </DialogTitle>
                    <DialogDescription>
                        Enter a new name for "{currentName}". All notes in this folder will be updated.
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="folder-name">New Folder Name</Label>
                        <Input
                            id="folder-name"
                            value={folderName}
                            onChange={(e) => {
                                setFolderName(e.target.value);
                                setError('');
                            }}
                            placeholder="Enter new folder name"
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </div>
                    
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit">
                            Rename
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

