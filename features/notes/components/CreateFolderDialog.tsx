// features/notes/components/CreateFolderDialog.tsx
"use client";

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FOLDER_CATEGORIES } from '../constants/folderCategories';
import { cn } from '@/lib/utils';

interface CreateFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (folderName: string) => void;
    existingFolders?: string[];
}

export function CreateFolderDialog({
    open,
    onOpenChange,
    onConfirm,
    existingFolders = [],
}: CreateFolderDialogProps) {
    const [folderName, setFolderName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const trimmedName = folderName.trim();
        
        if (!trimmedName) {
            setError('Folder name cannot be empty');
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
            setFolderName('');
            setSelectedCategory(null);
            setError('');
        }
        onOpenChange(newOpen);
    };

    const handleCategorySelect = (category: typeof FOLDER_CATEGORIES[0]) => {
        setSelectedCategory(category.id);
        setFolderName(category.label);
        setError('');
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[85dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                        Enter a custom name or choose from popular categories below.
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 overflow-hidden">
                    <div className="grid gap-2">
                        <Label htmlFor="folder-name">Folder Name</Label>
                        <Input
                            id="folder-name"
                            value={folderName}
                            onChange={(e) => {
                                setFolderName(e.target.value);
                                setSelectedCategory(null);
                                setError('');
                            }}
                            placeholder="e.g., Work, Personal, Ideas"
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2 flex-1 overflow-hidden">
                        <Label>Or Choose a Category</Label>
                        <ScrollArea className="flex-1 pr-4">
                            <div className="grid grid-cols-2 gap-2">
                                {FOLDER_CATEGORIES.map((category) => {
                                    const Icon = category.icon;
                                    const isSelected = selectedCategory === category.id;
                                    return (
                                        <button
                                            key={category.id}
                                            type="button"
                                            onClick={() => handleCategorySelect(category)}
                                            className={cn(
                                                "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                                                "hover:bg-accent",
                                                isSelected 
                                                    ? "border-primary bg-primary/10" 
                                                    : "border-border"
                                            )}
                                        >
                                            <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", category.color)} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-foreground">
                                                    {category.label}
                                                </div>
                                                <div className="text-xs text-muted-foreground line-clamp-2">
                                                    {category.description}
                                                </div>
                                            </div>
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
                        <Button type="submit">
                            Create Folder
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

