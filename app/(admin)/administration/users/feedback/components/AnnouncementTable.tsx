'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getAllAnnouncements, updateAnnouncement, deleteAnnouncement } from '@/actions/feedback.actions';
import { SystemAnnouncement, AnnouncementType } from '@/types/feedback.types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, AlertTriangle, Info, Megaphone, Trash2, Calendar, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from "@/lib/toast";
import { readOf } from '@ai-matrx/design-system';
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
import { RichContent } from '@ai-matrx/rich-content/levels/RichContent';
import { CopyButtons } from '@/components/agent-copy/CopyButtons';
import { csvExportItem, jsonExportItem } from '@/components/agent-copy/export';
import { announcementSummary } from '../format';
import { MatrxDataTable } from '@ai-matrx/design-system/data-table';
import type { MatrxColumnDef } from '@ai-matrx/design-system/data-table/types';

const LOCATION =
    'AI Matrx Admin — Feedback Management · Announcements (/administration/users/feedback?tab=announcements)';

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
    const [loadError, setLoadError] = useState<unknown>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<SystemAnnouncement | null>(null);

    useEffect(() => {
        loadAnnouncements();
    }, []);

    async function loadAnnouncements() {
        setLoading(true);
        setLoadError(null);
        try {
            const result = await getAllAnnouncements();
            if (result.success && result.data) {
                setAnnouncements(result.data);
                setLoadError(null);
                setHasLoaded(true);
            } else {
                setLoadError(result.error ? new Error(result.error) : true);
            }
        } catch (err) {
            setLoadError(err);
        } finally {
            setLoading(false);
        }
    }

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
            toast.success('Announcement moved to Trash');
            loadAnnouncements();
            setDeleteDialogOpen(false);
            setAnnouncementToDelete(null);
        } else {
            toast.error('Could not move the announcement to Trash: ' + result.error);
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

    const columns = useMemo<MatrxColumnDef<SystemAnnouncement>[]>(() => [
        {
            id: 'type',
            accessorKey: 'announcement_type',
            header: 'Type',
            filter: 'select',
            width: 88,
            cell: (announcement) => <div className="flex justify-center">{announcementIcons[announcement.announcement_type]}</div>,
        },
        {
            id: 'title',
            accessorKey: 'title',
            header: 'Title',
            filter: 'text',
            width: 280,
            cell: (announcement) => <span className="block truncate font-medium" title={announcement.title}>{announcement.title}</span>,
        },
        {
            id: 'message',
            accessorKey: 'message',
            header: 'Message',
            filter: 'text',
            width: 420,
            cell: (announcement) => <span className="block truncate text-muted-foreground" title={announcement.message}>{announcement.message}</span>,
        },
        {
            id: 'active',
            accessorKey: 'is_active',
            header: 'Status',
            filter: 'boolean',
            width: 130,
            cell: (announcement) => <div className="flex items-center gap-2"><Switch checked={announcement.is_active} onCheckedChange={(checked) => void handleToggleActive(announcement.id, checked)} /><span className="text-xs">{announcement.is_active ? 'Active' : 'Inactive'}</span></div>,
        },
        {
            id: 'display',
            accessorKey: 'min_display_seconds',
            header: 'Display',
            filter: 'number',
            width: 110,
            cell: (announcement) => `${announcement.min_display_seconds}s`,
        },
        {
            id: 'created',
            accessorKey: 'created_at',
            header: 'Created',
            filter: 'date',
            sortValue: (announcement) => new Date(announcement.created_at).getTime(),
            width: 160,
            mobileHidden: true,
            cell: (announcement) => formatDistanceToNow(new Date(announcement.created_at), { addSuffix: true }),
        },
    ], []);

    return (
        <>
            <Card className="p-4">
                {/* Table owner, 2026-09-28: preserve the loaded-window coverage
                    and existing announcement actions as the sole record controls.
                    Numbered pagination follows Arman's stable-footer instruction. */}
                <MatrxDataTable
                    data={announcements}
                    columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (announcement) => <div className="flex items-center gap-2"><Badge className={announcementTypeColors[announcement.announcement_type]}>{announcement.announcement_type}</Badge><Button icon={<Eye />} aria-label="View details" variant="quiet" onClick={() => handleView(announcement)} title="View details" /><Button icon={<Trash2 />} aria-label="Move announcement to Trash" variant="quiet" onClick={() => { setAnnouncementToDelete(announcement.id); setDeleteDialogOpen(true); }} title="Move announcement to Trash" /></div> }]}
                    getRowId={(announcement) => announcement.id}
                    onRowOpen={handleEdit}
                    viewTabs={false}
                    copy={{
                        label: 'Announcement',
                        listLabel: 'Announcements (this view)',
                        location: LOCATION,
                        rowKind: 'system-announcement',
                        listKind: 'system-announcements',
                        rowDescription: 'One system announcement row.',
                        listDescription: 'The filtered announcements loaded by this page.',
                        humanRow: announcementSummary,
                        agentRow: (announcement) => announcement,
                        rowAttributes: (announcement) => ({
                            id: announcement.id,
                            type: announcement.announcement_type,
                            active: announcement.is_active,
                        }),
                        listHuman: (visible) => visible.map(announcementSummary).join('\n\n'),
                        export: (_visible, all) => ({
                            items: [
                                jsonExportItem(() => all, 'JSON (all loaded announcements)'),
                                csvExportItem(
                                    () => all.map((announcement) => ({
                                        id: announcement.id,
                                        title: announcement.title,
                                        message: announcement.message,
                                        announcement_type: announcement.announcement_type,
                                        is_active: announcement.is_active,
                                        min_display_seconds: announcement.min_display_seconds,
                                        created_at: announcement.created_at,
                                        updated_at: announcement.updated_at,
                                        created_by: announcement.created_by,
                                        target_user_id: announcement.target_user_id,
                                    })),
                                    'CSV (all loaded announcements)',
                                ),
                            ],
                        }),
                    }}
                    detail={{ enabled: false }}
                    window={{ enabled: false }}
                    coverage={{ answeredBy: 'client', noun: 'system announcement', total: announcements.length }}
                    isLoading={loading && !hasLoaded}
                    isFetching={loading && hasLoaded}
                    read={readOf(
                        { loading, error: loadError, hasData: hasLoaded },
                        { what: 'the announcements', onRetry: () => void loadAnnouncements() },
                    )}
                    emptyState={{
                        title: 'No announcements created yet',
                        description: 'Refresh to check for announcements created by another administrator.',
                        action: <Button variant="outline" onClick={() => void loadAnnouncements()}>Refresh</Button>,
                    }}
                    toolbar={{
                        title: 'Announcements',
                        search: true,
                        searchPlaceholder: 'Search announcements…',
                        refresh: { onRefresh: () => loadAnnouncements(), label: 'Refresh announcements' },
                    }}

                />
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
                                <span className="flex items-center justify-between gap-2">
                                    <span>
                                        {selectedAnnouncement.is_active ? 'Active' : 'Inactive'} announcement
                                    </span>
                                    <CopyButtons
                                        size="xs"
                                        className="mr-6"
                                        label={`Announcement "${selectedAnnouncement.title}"`}
                                        human={() => announcementSummary(selectedAnnouncement)}
                                        json={() => selectedAnnouncement}
                                        agent={() => ({
                                            kind: 'system-announcement',
                                            location: LOCATION,
                                            description:
                                                'The system announcement open in the view dialog.',
                                            data: selectedAnnouncement,
                                            summary: announcementSummary(selectedAnnouncement),
                                            attributes: {
                                                id: selectedAnnouncement.id,
                                                type: selectedAnnouncement.announcement_type,
                                                active: selectedAnnouncement.is_active,
                                            },
                                        })}
                                    />
                                </span>
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
                                    <div className="text-gray-700 dark:text-gray-300">
                                        <RichContent source={selectedAnnouncement.message} level="standard" />
                                    </div>
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
                        <AlertDialogTitle>Move this announcement to Trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            It stops showing to people and leaves this list. Its author can restore it from Trash.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setAnnouncementToDelete(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Move to Trash
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
