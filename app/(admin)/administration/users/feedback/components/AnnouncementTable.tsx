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
        const result = await getAllAnnouncements();
        if (result.success && result.data) {
            setAnnouncements(result.data);
        }
        setLoading(false);
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
            width: 280,
            cell: (announcement) => <div><div className="font-medium line-clamp-1">{announcement.title}</div><div className="text-xs text-muted-foreground line-clamp-1">{announcement.message}</div></div>,
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
                    <div className="flex items-center gap-1">
                        <CopyButtons
                            size="icon"
                            label="Announcements"
                            human={() => announcements.map(announcementSummary).join('\n\n')}
                            json={() => announcements}
                            agent={() => ({
                                kind: 'system-announcements',
                                location: LOCATION,
                                description: 'All system announcements.',
                                data: announcements,
                                attributes: { count: announcements.length },
                            })}
                          export={{
                            items: [
                              jsonExportItem(() => announcements),
                              csvExportItem(
                                  () =>
                                      announcements as unknown as Array<
                                          Record<string, unknown>
                                      >,
                                  'CSV',
                              ),
                            ],
                          }}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadAnnouncements}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Arman requested canonical adoption. The source returns this complete
                    local collection, so all rows stay available without inventing paging. */}
                <MatrxDataTable
                    data={announcements}
                    columns={columns}
                    getRowId={(announcement) => announcement.id}
                    onRowOpen={handleEdit}
                    hidePagination
                    localPagination={{ mode: 'progressive' }}
                    viewTabs={false}
                    toolbar={{ search: true, searchPlaceholder: 'Search announcements…' }}
                    rowActions={(announcement) => <div className="flex items-center gap-2"><Badge className={announcementTypeColors[announcement.announcement_type]}>{announcement.announcement_type}</Badge><CopyButtons size="xs" label={`Announcement "${announcement.title}"`} human={() => announcementSummary(announcement)} json={() => announcement} agent={() => ({ kind: 'system-announcement', location: LOCATION, description: 'One system announcement row.', data: announcement, summary: announcementSummary(announcement), attributes: { id: announcement.id, type: announcement.announcement_type, active: announcement.is_active } })} /><Button variant="ghost" size="sm" onClick={() => handleView(announcement)} className="h-7 px-2" title="View details"><Eye className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => { setAnnouncementToDelete(announcement.id); setDeleteDialogOpen(true); }} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete announcement"><Trash2 className="w-4 h-4" /></Button></div>}
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
