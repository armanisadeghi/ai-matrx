'use client';

import React, { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranscripts } from "../hooks/useTranscripts";
import { useToastManager } from '@/hooks/useToastManager';
import type { Transcript } from '../types';

interface DeleteTranscriptDialogProps {
    isOpen: boolean;
    onClose: () => void;
    transcript: Transcript | null;
}

export function DeleteTranscriptDialog({
    isOpen,
    onClose,
    transcript,
}: DeleteTranscriptDialogProps) {
    const { deleteTranscript } = useTranscripts();
    const toast = useToastManager('transcripts');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!transcript) return;

        setIsDeleting(true);
        try {
            await deleteTranscript(transcript.id);
            toast.success('Transcript and audio file deleted');
            onClose();
        } catch (error: any) {
            console.error('Error deleting transcript:', error);
            toast.error(error.message || 'Failed to delete transcript');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!transcript) return null;

    const hasAudioFile = transcript.audio_file_path;

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <AlertDialogTitle>Delete Transcript</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="space-y-2 pt-2">
                        <p>
                            Are you sure you want to delete <span className="font-semibold text-foreground">"{transcript.title}"</span>?
                        </p>
                        {hasAudioFile && (
                            <p className="flex items-start gap-1.5 font-medium text-orange-600 dark:text-orange-400">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                <span>This will permanently delete both the transcript and the audio file from storage.</span>
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            This action cannot be undone.
                        </p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            'Delete Permanently'
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
