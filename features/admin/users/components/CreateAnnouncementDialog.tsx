'use client';

import { useState } from 'react';
import { createAnnouncement } from '@/actions/feedback.actions';
import { AnnouncementType } from '@/types/feedback.types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@ai-matrx/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from "@/lib/toast";
import { useRegisterAnnouncementEditor } from './FeedbackConsoleEditorStore';
import { ProTextarea } from "@/components/official/ProTextarea";

interface CreateAnnouncementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

const announcementTypes: { value: AnnouncementType; label: string; description: string }[] = [
    { value: 'info', label: 'Info', description: 'General information' },
    { value: 'warning', label: 'Warning', description: 'Important warning' },
    { value: 'critical', label: 'Critical', description: 'Critical issue' },
    { value: 'update', label: 'Update', description: 'System update' },
];

export default function CreateAnnouncementDialog({ open, onOpenChange, onSuccess }: CreateAnnouncementDialogProps) {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [announcementType, setAnnouncementType] = useState<AnnouncementType>('info');
    const [isSubmitting, setIsSubmitting] = useState(false);

    /**
     * Write half — the `create` handle for `announcement_draft` (see the
     * manifest and `FeedbackConsoleEditorStore`). Registered UNCONDITIONALLY,
     * including while the dialog is closed: a Radix modal puts
     * `pointer-events: none` on the body, so an admin cannot open this dialog
     * and then type to an agent. The agent has to be able to open it, which
     * means the closed form still has to be reachable. `open()` is why.
     *
     * `applyDraft` calls this component's own setters — the same ones the
     * admin's keystrokes go through — so nothing here is a parallel write
     * path, and the staged copy still needs the admin to press "Create
     * Announcement". That press is never an agent action.
     */
    useRegisterAnnouncementEditor({
        mode: 'create',
        isOpen: open,
        announcementId: null,
        title,
        message,
        announcementType,
        isSubmitting,
        open: () => onOpenChange(true),
        applyDraft: (patch) => {
            if (patch.title !== undefined) setTitle(patch.title);
            if (patch.message !== undefined) setMessage(patch.message);
            if (patch.announcement_type !== undefined) setAnnouncementType(patch.announcement_type);
        },
    });

    const handleSubmit = async () => {
        if (!title.trim() || !message.trim()) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await createAnnouncement({
                title: title.trim(),
                message: message.trim(),
                announcement_type: announcementType,
            });

            if (result.success) {
                toast.success('Announcement created successfully!');
                // Reset form
                setTitle('');
                setMessage('');
                setAnnouncementType('info');
                onOpenChange(false);
                // Trigger refresh callback
                if (onSuccess) {
                    onSuccess();
                }
            } else {
                toast.error('Failed to create announcement: ' + result.error);
            }
        } catch (error) {
            console.error('Error creating announcement:', error);
            toast.error('An error occurred while creating the announcement');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* A surface-write confirm ("An agent wants to set Announcement
                draft…") renders OUTSIDE this dialog, so answering or dismissing
                it counts as an outside interaction and would close this dialog —
                discarding the copy the admin was about to review. Keep it open;
                Cancel and Escape still close it. */}
            <DialogContent
                className="max-w-2xl max-h-[90dvh] overflow-y-auto"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Create New Announcement</DialogTitle>
                    <DialogDescription>
                        Create a system-wide announcement that will be shown to users on their next login.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title">Title *</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Major System Update"
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label htmlFor="type">Announcement Type *</Label>
                        <Select
                            value={announcementType}
                            onValueChange={(value) => setAnnouncementType(value as AnnouncementType)}
                            disabled={isSubmitting}
                        >
                            <SelectTrigger id="type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {announcementTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{type.label}</span>
                                            <span className="text-xs text-gray-500">{type.description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                        <Label htmlFor="message">Message *</Label>
                        <ProTextarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter the announcement message here. Be clear and concise about what users need to know."
                            className="min-h-[200px]"
                            disabled={isSubmitting}
                        />
                        <p className="text-xs text-gray-500">
                            This message will be displayed prominently to users. To add a link, use markdown syntax: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[11px]">[link text](https://example.com)</code>
                        </p>
                    </div>

                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !title.trim() || !message.trim()}
                    >
                        {isSubmitting ? 'Creating...' : 'Create Announcement'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
