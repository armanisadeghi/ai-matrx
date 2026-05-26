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

const VALID_TABS = ['feedback', 'work-queue', 'announcements', 'categories'] as const;
type TabValue = typeof VALID_TABS[number];

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
    );
}
