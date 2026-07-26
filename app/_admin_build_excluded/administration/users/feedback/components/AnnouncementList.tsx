'use client';

import React, { useState, useEffect } from 'react';
import { getAllAnnouncements, updateAnnouncement, deleteAnnouncement } from '@/actions/feedback.actions';
import { SystemAnnouncement, AnnouncementType } from '@/types/feedback.types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, AlertTriangle, Info, Megaphone, Trash2, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import { renderAnnouncementMessage } from '@/utils/render-announcement-message';

const announcementIcons: Record<AnnouncementType, React.ReactNode> = {
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    critical: <AlertCircle className="w-5 h-5 text-red-500" />,
    update: <Megaphone className="w-5 h-5 text-purple-500" />,
};

const announcementTypeColors: Record<AnnouncementType, string> = {
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    update: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function AnnouncementList() {
    const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null);

    useEffect(() => {
        loadAnnouncements();
    }, []);

    const loadAnnouncements = async () => {
        setLoading(true);
        const result = await getAllAnnouncements();
        if (result.success && result.data) {
            setAnnouncements(result.data);
        }
        setLoading(false);
    };

    const handleToggleActive = async (announcementId: string, isActive: boolean) => {
        const result = await updateAnnouncement(announcementId, { is_active: isActive });
        if (result.success) {
            loadAnnouncements();
        }
    };

    const handleDelete = async () => {
        if (!announcementToDelete) return;
        
        const result = await deleteAnnouncement(announcementToDelete);
        if (result.success) {
            loadAnnouncements();
            setDeleteDialogOpen(false);
            setAnnouncementToDelete(null);
        }
    };

    if (loading) {
        return (
            <Card className="p-8 text-center">
                <p className="text-gray-600 dark:text-gray-400">Loading announcements...</p>
            </Card>
        );
    }

    if (announcements.length === 0) {
        return (
            <Card className="p-8 text-center">
                <p className="text-gray-600 dark:text-gray-400">No announcements created yet</p>
            </Card>
        );
    }

    return (
        <>
            <div className="space-y-4">
                {announcements.map((announcement) => (
                    <Card key={announcement.id} className="p-6">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                    {announcementIcons[announcement.announcement_type]}
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold mb-1">
                                            {announcement.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <Calendar className="w-4 h-4" />
                                            <span>
                                                Created {formatDistanceToNow(new Date(announcement.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className={announcementTypeColors[announcement.announcement_type]}>
                                        {announcement.announcement_type}
                                    </Badge>
                                    <Badge variant={announcement.is_active ? 'default' : 'secondary'}>
                                        {announcement.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Message */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {renderAnnouncementMessage(announcement.message)}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={announcement.is_active}
                                        onCheckedChange={(checked) => handleToggleActive(announcement.id, checked)}
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        {announcement.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                    <span className="text-sm text-gray-500 dark:text-gray-500 ml-4">
                                        Display: {announcement.min_display_seconds}s minimum
                                    </span>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                        setAnnouncementToDelete(announcement.id);
                                        setDeleteDialogOpen(true);
                                    }}
                                    className="gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setAnnouncementToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this announcement. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setAnnouncementToDelete(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

