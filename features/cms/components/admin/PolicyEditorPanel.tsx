'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { CmsSiteService } from '../../services/cmsService';
import type { AgentWritePolicy, ClientSiteSummary } from '../../types';
import { toClientSiteSummary } from '../../types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MatrxDataTable, type MatrxColumnDef } from '@ai-matrx/design-system/data-table';
import { Loader2, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { recordToast, toast } from "@/lib/toast";

const POLICY_META: Record<AgentWritePolicy, { label: string; icon: typeof ShieldOff; className: string }> = {
    blocked: { label: 'Blocked', icon: ShieldOff, className: 'text-muted-foreground border-border' },
    draft_only: { label: 'Draft only', icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400 border-amber-500/40' },
    full: { label: 'Full', icon: ShieldCheck, className: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40' },
};

const currentPolicy = (site: ClientSiteSummary): AgentWritePolicy =>
    (site.settings?.agent_write_policy ?? 'blocked') as AgentWritePolicy;

interface Props {
    sites: ClientSiteSummary[];
    onSiteUpdated: (site: ClientSiteSummary) => void;
}

export default function PolicyEditorPanel({ sites, onSiteUpdated }: Props) {
    const [savingId, setSavingId] = useState<string | null>(null);

    const handleChange = useCallback(async (site: ClientSiteSummary, policy: AgentWritePolicy) => {
        setSavingId(site.id);
        try {
            const updated = await CmsSiteService.adminUpdatePolicy(site.id, { agentWritePolicy: policy });
            // The write returns a FULL row; the list holds summaries. Narrow through
            // the one canonical converter so the two shapes can never diverge.
            onSiteUpdated(toClientSiteSummary(updated));
            recordToast.success(
                { type: 'cms_site', id: site.id, title: site.name },
                `"${site.name}" agent policy set to ${POLICY_META[policy].label}`,
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update policy');
        } finally {
            setSavingId(null);
        }
    }, [onSiteUpdated]);

    const columns = useMemo((): MatrxColumnDef<ClientSiteSummary>[] => [
        { id: 'name', header: 'Site', accessorFn: (site) => site.name, width: 220, cell: (site) => <span className="font-medium">{site.name}</span> },
        { id: 'owner', header: 'Owner', accessorFn: (site) => site.owner_user_id ?? '', width: 260,
          cell: (site) => <span className="block truncate font-mono text-muted-foreground">{site.owner_user_id ?? '—'}</span> },
        { id: 'policy', header: 'Agent write policy', accessorFn: (site) => currentPolicy(site), filter: 'select', width: 280,
          cell: (site) => {
            const current = currentPolicy(site);
            const meta = POLICY_META[current];
            const Icon = meta.icon;
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                    </Badge>
                    <Select value={current} onValueChange={(v) => handleChange(site, v as AgentWritePolicy)} disabled={savingId === site.id}>
                        <SelectTrigger className="w-[140px]">
                            {savingId === site.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="blocked">Blocked</SelectItem>
                            <SelectItem value="draft_only">Draft only</SelectItem>
                            <SelectItem value="full">Full</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
          } },
    ], [savingId, handleChange]);

    return (
        <div className="flex flex-col h-full">
            <p className="flex-none px-1 py-2 text-xs text-muted-foreground">
                Per F4: <span className="font-medium text-foreground">blocked</span> — agents cannot write.{' '}
                <span className="font-medium text-foreground">draft only</span> — agents may save drafts, never
                publish. <span className="font-medium text-foreground">full</span> — agents may publish directly.
                Enforced by P1&apos;s service layer; this only edits the setting.
            </p>
            <div className="flex-1 min-h-0">
                <MatrxDataTable<ClientSiteSummary>
                    tableId="cms-admin-agent-policy"
                    data={sites}
                    columns={columns}
                    getRowId={(site) => site.id}
                    rowVersion={(site) => `${site.settings?.agent_write_policy ?? ''}|${savingId === site.id}`}
                    emptyState={{ title: 'No sites in the fleet yet' }}
                    detail={{ enabled: false }}
                    copy={{
                        label: 'CMS agent write policy',
                        location: 'CMS Admin Agent Write Policy',
                        rowKind: 'cms-site-policy',
                        listKind: 'cms-site-policy-list',
                        humanRow: (site) => `${site.name}: ${currentPolicy(site)}`,
                        agentRow: (site) => ({ id: site.id, name: site.name, owner_user_id: site.owner_user_id, agent_write_policy: currentPolicy(site) }),
                    }}
                />
            </div>
        </div>
    );
}
