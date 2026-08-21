'use client';

import React, { useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FeedbackTable from './FeedbackTable';
import WorkQueueTab from './WorkQueueTab';
import AnnouncementTable from './AnnouncementTable';
import CreateAnnouncementDialog from './CreateAnnouncementDialog';
import CategoriesTab from './CategoriesTab';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, Megaphone, ListOrdered, Tag } from 'lucide-react';
import { SurfaceRuntimeProvider } from '@/features/surfaces/runtime/SurfaceRuntimeContext';
import {
    ADMIN_FEEDBACK_SURFACE_NAME,
    createAdminFeedbackScope,
} from '@/features/surfaces/manifests/admin-feedback.manifest';
import { parseAnnouncementDraftPatch } from '@/features/admin/feedback/announcement-draft';
import { parseCategoryDraftPatch } from '@/features/admin/feedback/category-draft';
import {
    FeedbackConsoleEditorProvider,
    readAnnouncementEditorValue,
    readCategoryEditorValue,
    resolveAnnouncementEditor,
    useFeedbackConsoleEditorStore,
    type FeedbackConsoleEditorStore,
} from './FeedbackConsoleEditorStore';

const VALID_TABS = ['feedback', 'work-queue', 'announcements', 'categories'] as const;
type TabValue = typeof VALID_TABS[number];

/**
 * The surface emitter for `matrx-admin/feedback`. Split out from the console
 * body only so it sits INSIDE `FeedbackConsoleEditorProvider` and can read the
 * editor registry that the announcement dialogs and the categories tab publish
 * into.
 *
 * Both handlers follow the same order, and the order is the point:
 * VALIDATE THE WHOLE PAYLOAD FIRST, then resolve the editor, then open/reveal,
 * then stage. A rejected write must leave the page exactly as it found it — the
 * alternative ships the bug where an invalid value opens an empty form and then
 * throws, stranding a dialog the admin never asked for.
 *
 * Every guard is read off `store` (a ref-backed registry) at CALL time, never
 * off this render's closure: `applySurfaceWrite` resolves `getWriteHandlers()`
 * BEFORE the confirm dialog is answered, so anything captured here would be
 * stale by the time the admin clicks Apply.
 */
function FeedbackConsoleSurface({
    activeTab,
    children,
}: {
    activeTab: TabValue;
    children: React.ReactNode;
}) {
    const store = useFeedbackConsoleEditorStore();

    const getScope = useCallback(() => {
        const editorStore = store as FeedbackConsoleEditorStore | null;
        return createAdminFeedbackScope({
            active_tab: activeTab,
            announcement_editor: editorStore
                ? readAnnouncementEditorValue(editorStore)
                : undefined,
            category_editor: editorStore
                ? readCategoryEditorValue(editorStore)
                : undefined,
        });
    }, [activeTab, store]);

    const getWriteHandlers = useCallback(
        () => ({
            announcement_draft: (value: unknown) => {
                // 1. Shape and vocabulary, before anything on screen moves.
                const patch = parseAnnouncementDraftPatch(value);
                if (!store)
                    throw new Error(
                        'The Feedback & Announcements console is not mounted, so there is nowhere to stage this announcement copy.',
                    );

                // 2. Which of the two editors is live — refuse, never guess.
                const resolved = resolveAnnouncementEditor(store);
                if (!resolved.ok) throw new Error(resolved.reason);
                const editor = resolved.handle;

                // 3. A save is already in flight against the OLD copy, so
                //    editing it would leave the form describing something the
                //    admin did not submit.
                if (editor.isSubmitting)
                    throw new Error(
                        `The ${editor.mode === 'edit' ? 'Edit' : 'Create'} Announcement dialog is saving right now. Wait for it to finish and ask again.`,
                    );

                // 4. Only now is anything allowed to change.
                if (!editor.isOpen) editor.open();
                editor.applyDraft(patch);
            },

            category_draft: (value: unknown) => {
                const patch = parseCategoryDraftPatch(value);
                if (!store)
                    throw new Error(
                        'The Feedback & Announcements console is not mounted, so there is nowhere to stage this category copy.',
                    );

                const editor = store.categoryEditor;
                if (!editor)
                    throw new Error(
                        'The Categories tab is not open, so its category editor does not exist yet. Switch to the Categories tab and ask again.',
                    );
                if (editor.isSaving)
                    throw new Error(
                        'The category form is saving right now. Wait for it to finish and ask again.',
                    );

                editor.applyDraft(patch);
            },
        }),
        [store],
    );

    return (
        <SurfaceRuntimeProvider
            surfaceName={ADMIN_FEEDBACK_SURFACE_NAME}
            getScope={getScope}
            getWriteHandlers={getWriteHandlers}
        >
            {children}
        </SurfaceRuntimeProvider>
    );
}

export default function FeedbackManagementContainer() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const tabParam = searchParams.get('tab');
    const activeTab: TabValue = VALID_TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : 'feedback';

    const setActiveTab = useCallback((tab: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === 'feedback') {
            params.delete('tab');
        } else {
            params.set('tab', tab);
        }
        const query = params.toString();
        router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const [isCreateAnnouncementOpen, setIsCreateAnnouncementOpen] = useState(false);
    const [announcementKey, setAnnouncementKey] = useState(0);

    return (
        <FeedbackConsoleEditorProvider>
            <FeedbackConsoleSurface activeTab={activeTab}>
                <div className="container mx-auto p-4 md:p-6 max-w-full">
                    <div className="mb-6">
                        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
                            Feedback & Announcements
                        </h1>
                        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                            Manage user feedback, bug reports, and system announcements
                        </p>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                            <TabsList>
                                <TabsTrigger value="feedback" className="gap-2">
                                    <MessageSquare className="w-4 h-4" />
                                    <span className="hidden sm:inline">Feedback</span>
                                </TabsTrigger>
                                <TabsTrigger value="work-queue" className="gap-2">
                                    <ListOrdered className="w-4 h-4" />
                                    <span className="hidden sm:inline">Work Queue</span>
                                </TabsTrigger>
                                <TabsTrigger value="announcements" className="gap-2">
                                    <Megaphone className="w-4 h-4" />
                                    <span className="hidden sm:inline">Announcements</span>
                                </TabsTrigger>
                                <TabsTrigger value="categories" className="gap-2">
                                    <Tag className="w-4 h-4" />
                                    <span className="hidden sm:inline">Categories</span>
                                </TabsTrigger>
                            </TabsList>

                            {activeTab === 'announcements' && (
                                <Button
                                    onClick={() => setIsCreateAnnouncementOpen(true)}
                                    className="gap-2 w-full sm:w-auto"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create Announcement
                                </Button>
                            )}
                        </div>

                        <TabsContent value="feedback" className="mt-0">
                            <FeedbackTable />
                        </TabsContent>

                        <TabsContent value="work-queue" className="mt-0">
                            <WorkQueueTab />
                        </TabsContent>

                        <TabsContent value="announcements" className="mt-0">
                            <AnnouncementTable key={announcementKey} />
                        </TabsContent>

                        <TabsContent value="categories" className="mt-0">
                            <CategoriesTab />
                        </TabsContent>
                    </Tabs>

                    <CreateAnnouncementDialog
                        open={isCreateAnnouncementOpen}
                        onOpenChange={setIsCreateAnnouncementOpen}
                        onSuccess={() => {
                            // Force re-render of announcements tab
                            setAnnouncementKey(prev => prev + 1);
                        }}
                    />
                </div>
            </FeedbackConsoleSurface>
        </FeedbackConsoleEditorProvider>
    );
}
