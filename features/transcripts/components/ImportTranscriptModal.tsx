// features/transcripts/components/ImportTranscriptModal.tsx
'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText } from 'lucide-react';
import { useTranscripts } from "../hooks/useTranscripts";
import type { TranscriptSegment } from '../types';
import { useToastManager } from '@/hooks/useToastManager';

interface ImportTranscriptModalProps {
    isOpen: boolean;
    onClose: () => void;
    segments: TranscriptSegment[];
}

export function ImportTranscriptModal({
    isOpen,
    onClose,
    segments,
}: ImportTranscriptModalProps) {
    const { createTranscript } = useTranscripts();
    const toast = useToastManager('transcripts');
    
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [folder, setFolder] = useState('Transcripts');
    const [sourceType, setSourceType] = useState<'audio' | 'video' | 'meeting' | 'interview' | 'other'>('meeting');
    const [isImporting, setIsImporting] = useState(false);

    const handleImport = async () => {
        if (!title.trim()) {
            toast.error('Please enter a title');
            return;
        }

        setIsImporting(true);

        try {
            await createTranscript({
                title: title.trim(),
                description: description.trim(),
                segments,
                folder_name: folder,
                source_type: sourceType,
                tags: [],
            });

            toast.success('Transcript imported successfully');
            onClose();
            
            // Reset form
            setTitle('');
            setDescription('');
            setFolder('Transcripts');
            setSourceType('meeting');
        } catch (error) {
            console.error('Import failed:', error);
            toast.error('Failed to import transcript');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Import Transcript
                    </DialogTitle>
                </DialogHeader>

                {!isImporting ? (
                    <>
                        <div className="space-y-4 py-4">
                            {/* Title */}
                            <div className="space-y-2">
                                <Label htmlFor="title">Title *</Label>
                                <Input
                                    id="title"
                                    placeholder="e.g., Team Meeting - Oct 24, 2025"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Add any additional details..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>

                            {/* Source Type */}
                            <div className="space-y-2">
                                <Label htmlFor="source-type">Source Type</Label>
                                <Select value={sourceType} onValueChange={(v: any) => setSourceType(v)}>
                                    <SelectTrigger id="source-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="audio">Audio Recording</SelectItem>
                                        <SelectItem value="video">Video Recording</SelectItem>
                                        <SelectItem value="meeting">Meeting</SelectItem>
                                        <SelectItem value="interview">Interview</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Folder */}
                            <div className="space-y-2">
                                <Label htmlFor="folder">Folder</Label>
                                <Input
                                    id="folder"
                                    placeholder="Transcripts"
                                    value={folder}
                                    onChange={(e) => setFolder(e.target.value)}
                                />
                            </div>

                            {/* Preview Info */}
                            <div className="rounded-lg border-border p-3 bg-gray-50 dark:bg-gray-800/50">
                                <div className="text-sm space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-400">Segments:</span>
                                        <span className="font-medium">{segments.length}</span>
                                    </div>
                                    {segments.length > 0 && segments[segments.length - 1] && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                                            <span className="font-medium">
                                                {Math.floor(segments[segments.length - 1].seconds / 60)}:
                                                {(segments[segments.length - 1].seconds % 60).toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button onClick={handleImport} disabled={!title.trim()}>
                                Import Transcript
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                        <div className="text-center">
                            <p className="text-lg font-medium">Importing transcript...</p>
                            <p className="text-sm text-gray-500">Please wait</p>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

