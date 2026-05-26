'use client';

import React, { useState, useEffect } from 'react';
import { updateAnnouncement } from '@/actions/feedback.actions';
import { AnnouncementType, SystemAnnouncement } from '@/types/feedback.types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Eye, EyeOff, AlertCircle, AlertTriangle, Info, Megaphone, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { renderAnnouncementMessage } from '@/utils/render-announcement-message';

interface EditAnnouncementDialogProps {
    announcement: SystemAnnouncement | null;
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

const previewIcons: Record<AnnouncementType, React.ReactNode> = {
    info: <Info className="w-12 h-12 text-blue-500" />,
    warning: <AlertTriangle className="w-12 h-12 text-yellow-500" />,
    critical: <AlertCircle className="w-12 h-12 text-red-500" />,
    update: <Megaphone className="w-12 h-12 text-purple-500" />,
};

const previewStyles: Record<AnnouncementType, string> = {
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
    critical: 'border-red-500 bg-red-50 dark:bg-red-950/20',
    update: 'border-purple-500 bg-purple-50 dark:bg-purple-950/20',
};

export default function EditAnnouncementDialog({ announcement, open, onOpenChange, onSuccess }: EditAnnouncementDialogProps) {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [announcementType, setAnnouncementType] = useState<AnnouncementType>('info');
    const [minDisplaySeconds, setMinDisplaySeconds] = useState(3);
    const [isActive, setIsActive] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (announcement) {
            setTitle(announcement.title);
            setMessage(announcement.message);
            setAnnouncementType(announcement.announcement_type);
            setMinDisplaySeconds(announcement.min_display_seconds);
            setIsActive(announcement.is_active);
        }
    }, [announcement]);

    const handleSubmit = async () => {
        if (!announcement) return;
        
        if (!title.trim() || !message.trim()) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await updateAnnouncement(announcement.id, {
                title: title.trim(),
                message: message.trim(),
                announcement_type: announcementType,
                min_display_seconds: minDisplaySeconds,
                is_active: isActive,
            });

            if (result.success) {
                toast.success('Announcement updated successfully!');
                onOpenChange(false);
                if (onSuccess) {
                    onSuccess();
                }
            } else {
                toast.error('Failed to update announcement: ' + result.error);
            }
        } catch (error) {
            console.error('Error updating announcement:', error);
            toast.error('An error occurred while updating the announcement');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!announcement) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Announcement</DialogTitle>
                    <DialogDescription>
                        Update the announcement details. Changes will affect how users see this announcement.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Active Toggle */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div>
                            <Label htmlFor="active" className="font-medium">Active Status</Label>
                            <p className="text-xs text-gray-500">Control whether this announcement is shown to users</p>
                        </div>
                        <Switch
                            id="active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                            disabled={isSubmitting}
                        />
                    </div>

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
                                        <span className="font-medium">{type.label}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{type.description}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                        <Label htmlFor="message">Message *</Label>
                        <Textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter the announcement message here..."
                            className="min-h-[200px]"
                            disabled={isSubmitting}
                        />
                        <p className="text-xs text-gray-500">
                            To add a link, use markdown syntax: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[11px]">[link text](https://example.com)</code>
                        </p>
                    </div>

                    {/* Min Display Seconds */}
                    <div className="space-y-2">
                        <Label htmlFor="displaySeconds">Minimum Display Time (seconds)</Label>
                        <Input
                            id="displaySeconds"
                            type="number"
                            min={1}
                            max={30}
                            value={minDisplaySeconds}
                            onChange={(e) => setMinDisplaySeconds(parseInt(e.target.value) || 3)}
                            disabled={isSubmitting}
                        />
                        <p className="text-xs text-gray-500">
                            Users must wait this many seconds before they can close the announcement.
                        </p>
                    </div>

                    {/* Preview Toggle */}
                    <div className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPreview(!showPreview)}
                            className="w-full gap-2"
                            disabled={!title.trim() && !message.trim()}
                        >
                            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {showPreview ? 'Hide Preview' : 'Preview as User'}
                        </Button>
                    </div>

                    {/* Live Preview */}
                    {showPreview && (title.trim() || message.trim()) && (
                        <div className="rounded-lg bg-black/70 p-4">
                            <p className="text-xs text-gray-400 mb-2 text-center font-medium">User View Preview</p>
                            <Card className={`relative w-full border-4 shadow-2xl ${previewStyles[announcementType]}`}>
                                <button
                                    type="button"
                                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-default"
                                    tabIndex={-1}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-shrink-0">
                                            {previewIcons[announcementType]}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                            Please read ({minDisplaySeconds}s)
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                                        {title || 'Announcement Title'}
                                    </h2>
                                    <div className="prose dark:prose-invert max-w-none mb-6">
                                        <p className="text-base text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                            {message ? renderAnnouncementMessage(message) : 'Announcement message will appear here...'}
                                        </p>
                                    </div>
                                    <div className="flex gap-3 justify-end">
                                        <Button variant="outline" size="sm" disabled className="min-w-[100px]">
                                            Close
                                        </Button>
                                        <Button size="sm" disabled className="min-w-[100px]">
                                            Don't Show Again
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}
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
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

