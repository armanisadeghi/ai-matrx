'use client';

import React, { useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from "@/lib/toast";

const POLICY_META: Record<AgentWritePolicy, { label: string; icon: typeof ShieldOff; className: string }> = {
    blocked: { label: 'Blocked', icon: ShieldOff, className: 'text-muted-foreground border-border' },
    draft_only: { label: 'Draft only', icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400 border-amber-500/40' },
    full: { label: 'Full', icon: ShieldCheck, className: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40' },
};

interface Props {
    sites: ClientSiteSummary[];
    onSiteUpdated: (site: ClientSiteSummary) => void;
}

export default function PolicyEditorPanel({ sites, onSiteUpdated }: Props) {
    const [savingId, setSavingId] = useState<string | null>(null);

    const handleChange = async (site: ClientSiteSummary, policy: AgentWritePolicy) => {
        setSavingId(site.id);
        try {
            const updated = await CmsSiteService.adminUpdatePolicy(site.id, { agentWritePolicy: policy });
            // The write returns a FULL row; the list holds summaries. Narrow through
            // the one canonical converter so the two shapes can never diverge.
            onSiteUpdated(toClientSiteSummary(updated));
            toast.success(`"${site.name}" agent policy set to ${POLICY_META[policy].label}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update policy');
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <p className="flex-none px-1 py-2 text-xs text-muted-foreground">
                Per F4: <span className="font-medium text-foreground">blocked</span> — agents cannot write.{' '}
                <span className="font-medium text-foreground">draft_only</span> — agents may save drafts, never
                publish. <span className="font-medium text-foreground">full</span> — agents may publish directly.
                Enforced by P1&apos;s service layer; this only edits the setting.
            </p>
            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead className="h-8 text-xs">Site</TableHead>
                            <TableHead className="h-8 text-xs">Owner</TableHead>
                            <TableHead className="h-8 text-xs">Agent write policy</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sites.map((site) => {
                            const current = (site.settings?.agent_write_policy ?? 'blocked') as AgentWritePolicy;
                            const meta = POLICY_META[current];
                            const Icon = meta.icon;
                            return (
                                <TableRow key={site.id} className="text-xs">
                                    <TableCell className="py-1.5 font-medium">
                                        {site.name}
                                        <span className="ml-1.5 text-muted-foreground font-mono">{site.slug}</span>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-muted-foreground font-mono max-w-[220px] truncate">
                                        {site.owner_user_id ?? '—'}
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
                                                <Icon className="h-3 w-3" />
                                                {meta.label}
                                            </Badge>
                                            <Select
                                                value={current}
                                                onValueChange={(v) => handleChange(site, v as AgentWritePolicy)}
                                                disabled={savingId === site.id}
                                            >
                                                <SelectTrigger className="h-7 w-[140px] text-xs">
                                                    {savingId === site.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <SelectValue />
                                                    )}
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="blocked">Blocked</SelectItem>
                                                    <SelectItem value="draft_only">Draft only</SelectItem>
                                                    <SelectItem value="full">Full</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
