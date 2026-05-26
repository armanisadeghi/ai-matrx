'use client';

import React, { useState, useEffect } from 'react';
import { getAllAnnouncements, updateAnnouncement, deleteAnnouncement } from '@/actions/feedback.actions';
import { SystemAnnouncement, AnnouncementType } from '@/types/feedback.types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, AlertTriangle, Info, Megaphone, Trash2, Calendar, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditAnnouncementDialog from './EditAnnouncementDialog';
import { renderAnnouncementMessage } from '@/utils/render-announcement-message';

const announcementIcons: Record<AnnouncementType, React.ReactNode> = {
    info: <Info className="w-4 h-4 text-blue-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    critical: <AlertCircle className="w-4 h-4 text-red-500" />,
    update: <Megaphone className="w-4 h-4 text-purple-500" />,
};

const announcementTypeColors: Record<AnnouncementType, string> = {
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    update: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function AnnouncementTable() {
    const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<SystemAnnouncement | null>(null);

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
            toast.success(`Announcement ${isActive ? 'activated' : 'deactivated'}`);
            loadAnnouncements();
        } else {
            toast.error('Failed to update announcement: ' + result.error);
        }
    };

    const handleDelete = async () => {
        if (!announcementToDelete) return;
        
        const result = await deleteAnnouncement(announcementToDelete);
        if (result.success) {
            toast.success('Announcement deleted successfully');
            loadAnnouncements();
            setDeleteDialogOpen(false);
            setAnnouncementToDelete(null);
        } else {
            toast.error('Failed to delete announcement: ' + result.error);
        }
    };

    const handleView = (announcement: SystemAnnouncement, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }
        setSelectedAnnouncement(announcement);
        setViewDialogOpen(true);
    };

    const handleEdit = (announcement: SystemAnnouncement) => {
        setSelectedAnnouncement(announcement);
        setEditDialogOpen(true);
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
            <Card className="p-4">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>{announcements.length}</strong> announcement{announcements.length !== 1 ? 's' : ''}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadAnnouncements}
                    >
                        Refresh
                    </Button>
                </div>

                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50 dark:bg-gray-900">
                                <TableHead className="w-[80px]">Type</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead className="w-[120px]">Status</TableHead>
                                <TableHead className="w-[100px]">Display</TableHead>
                                <TableHead className="w-[150px]">Created</TableHead>
                                <TableHead className="w-[200px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {announcements.map((announcement) => (
                                <TableRow 
                                    key={announcement.id} 
                                    className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                                    onClick={() => handleEdit(announcement)}
                                >
                                    <TableCell>
                                        <div className="flex items-center justify-center">
                                            {announcementIcons[announcement.announcement_type]}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium line-clamp-1">
                                                {announcement.title}
                                            </div>
                                            <div className="text-xs text-gray-500 line-clamp-1">
                                                {announcement.message}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={announcement.is_active}
                                                onCheckedChange={(checked) => handleToggleActive(announcement.id, checked)}
                                            />
                                            <span className="text-xs">
                                                {announcement.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                                        {announcement.min_display_seconds}s
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                                        {formatDistanceToNow(new Date(announcement.created_at), { addSuffix: true })}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <Badge className={announcementTypeColors[announcement.announcement_type]}>
                                                {announcement.announcement_type}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => handleView(announcement, e)}
                                                className="h-7 px-2"
                                                title="View details"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAnnouncementToDelete(announcement.id);
                                                    setDeleteDialogOpen(true);
                                                }}
                                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Delete announcement"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* View Dialog */}
            {selectedAnnouncement && (
                <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {announcementIcons[selectedAnnouncement.announcement_type]}
                                {selectedAnnouncement.title}
                            </DialogTitle>
                            <DialogDescription>
                                {selectedAnnouncement.is_active ? 'Active' : 'Inactive'} announcement
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-xs text-gray-500">Type</div>
                                    <Badge className={announcementTypeColors[selectedAnnouncement.announcement_type]}>
                                        {selectedAnnouncement.announcement_type}
                                    </Badge>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Display Time</div>
                                    <div className="font-medium">{selectedAnnouncement.min_display_seconds} seconds</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Created</div>
                                    <div className="font-medium">
                                        {formatDistanceToNow(new Date(selectedAnnouncement.created_at), { addSuffix: true })}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Status</div>
                                    <div className="font-medium">{selectedAnnouncement.is_active ? 'Active' : 'Inactive'}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium mb-2">Message</div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {renderAnnouncementMessage(selectedAnnouncement.message)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Edit Dialog */}
            <EditAnnouncementDialog
                announcement={selectedAnnouncement}
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                onSuccess={loadAnnouncements}
            />

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
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

