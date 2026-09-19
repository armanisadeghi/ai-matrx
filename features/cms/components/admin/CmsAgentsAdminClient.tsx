'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SurfaceRuntimeProvider } from '@/features/surfaces/runtime/SurfaceRuntimeContext';
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from '@/features/surfaces/manifests/admin-knowledge.manifest';
import { CmsSiteService } from '../../services/cmsService';
import type { ClientSiteSummary } from '../../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, Radio } from 'lucide-react';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectUserId } from '@/lib/redux/selectors/userSelectors';
import { selectActiveOrganizationId } from '@/features/scopes/redux/selectors/active-context';
import { ApprovalQueue } from '@/features/approvals/ApprovalQueue';
import ActivityFeedPanel from './ActivityFeedPanel';
import SitePageTreePanel from './SitePageTreePanel';
import PolicyEditorPanel from './PolicyEditorPanel';
import AssetsPanel from './AssetsPanel';

export default function CmsAgentsAdminClient() {
    const [sites, setSites] = useState<ClientSiteSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('activity');
    // The approvals queue is addressed to a PERSON in an organization — the same
    // scope `/approvals` mounts, so this tab and that page agree row for row.
    const userId = useAppSelector(selectUserId);
    const organizationId = useAppSelector(selectActiveOrganizationId);

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

    const handleSiteUpdated = (updated: ClientSiteSummary) => {
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
        <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: 'cms_agents', cms_sites: sites })}>
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
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
                        Content Exceptions
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="text-xs">
                        Assets
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
                <TabsContent value="approvals" className="flex-1 min-h-0 mt-2 overflow-auto">
                    {/* 🚨 THE ONE QUEUE, NARROWED — never a second review screen
                        (chair ruling 2026-09-19, register row Q-1). This tab used
                        to mount a bespoke CMS panel with its own list, its own
                        approve/reject writer and no mode line, receipt, doors or
                        consequence sentence. It now mounts the platform queue with
                        a `kinds` filter, which is how every host narrows. The same
                        rows also appear, unfiltered, at /approvals. */}
                    <ApprovalQueue
                        scope={{ key: userId ?? 'cms-agents', organizationId, userId }}
                        kinds={['cms_content_exception']}
                        title="Content exceptions waiting on you"
                        defaultExpanded
                        hideWhenEmpty={false}
                    />
                </TabsContent>
                <TabsContent value="assets" className="flex-1 min-h-0 mt-2">
                    <AssetsPanel sites={sites} />
                </TabsContent>
            </Tabs>
        </div>
        </SurfaceRuntimeProvider>
    );
}
