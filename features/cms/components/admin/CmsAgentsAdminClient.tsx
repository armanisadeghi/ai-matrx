'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CmsSiteService } from '../../services/cmsService';
import type { ClientSite } from '../../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, Radio } from 'lucide-react';
import ActivityFeedPanel from './ActivityFeedPanel';
import SitePageTreePanel from './SitePageTreePanel';
import PolicyEditorPanel from './PolicyEditorPanel';
import ApprovalsQueuePanel from './ApprovalsQueuePanel';

export default function CmsAgentsAdminClient() {
    const [sites, setSites] = useState<ClientSite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSites = useCallback(async () => {
        try {
            const data = await CmsSiteService.adminListSites();
            setSites(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load sites');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSites();
    }, [fetchSites]);

    const handleSiteUpdated = (updated: ClientSite) => {
        setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-destructive text-sm">
                <AlertCircle className="h-6 w-6" />
                {error}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden p-4">
            <div className="flex-none flex items-center justify-between pb-3">
                <div>
                    <h1 className="text-base font-bold text-foreground">CMS Agent Activity</h1>
                    <p className="text-xs text-muted-foreground">
                        Live visibility into every agent + human write against the CMS project
                        (viyklljfdhtidwecakwx) — {sites.length} site{sites.length === 1 ? '' : 's'} in the fleet.
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Radio className="h-3 w-3 text-emerald-500" />
                    Polling every 8s
                </div>
            </div>

            <Tabs defaultValue="activity" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="flex-none w-fit">
                    <TabsTrigger value="activity" className="text-xs">
                        Activity Feed
                    </TabsTrigger>
                    <TabsTrigger value="pages" className="text-xs">
                        Sites &amp; Pages
                    </TabsTrigger>
                    <TabsTrigger value="policies" className="text-xs">
                        Agent Policies
                    </TabsTrigger>
                    <TabsTrigger value="approvals" className="text-xs">
                        Approvals Queue
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="flex-1 min-h-0 mt-2">
                    <ActivityFeedPanel sites={sites} />
                </TabsContent>
                <TabsContent value="pages" className="flex-1 min-h-0 mt-2">
                    <SitePageTreePanel sites={sites} />
                </TabsContent>
                <TabsContent value="policies" className="flex-1 min-h-0 mt-2">
                    <PolicyEditorPanel sites={sites} onSiteUpdated={handleSiteUpdated} />
                </TabsContent>
                <TabsContent value="approvals" className="flex-1 min-h-0 mt-2">
                    <ApprovalsQueuePanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
