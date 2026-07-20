'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CmsApprovalsService } from '../../services/cmsService';
import type { ContentException } from '../../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Check, X, ShieldQuestion } from 'lucide-react';
import { toast } from "@/lib/toast";

export default function ApprovalsQueuePanel() {
    const [violations, setViolations] = useState<ContentException[]>([]);
    const [available, setAvailable] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await CmsApprovalsService.list({ status: 'pending' });
            setViolations(res.violations);
            setAvailable(res.available);
            setMessage(res.message ?? null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to load approvals queue');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const act = async (id: string, action: 'approve' | 'reject') => {
        setActingId(id);
        try {
            if (action === 'approve') await CmsApprovalsService.approve(id);
            else await CmsApprovalsService.reject(id);
            setViolations((prev) => prev.filter((v) => v.id !== id));
            toast.success(action === 'approve' ? 'Exception approved' : 'Violation stays blocked');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
        } finally {
            setActingId(null);
        }
    };

    if (!available) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs px-6 text-center">
                <ShieldQuestion className="h-8 w-8 opacity-30" />
                <p className="font-medium text-foreground">Exception store not wired up yet</p>
                <p className="max-w-sm">
                    {message ?? 'Waiting on P1\'s client_content_exceptions table (C3 contract, matrx-content-guard).'}
                </p>
                <p className="max-w-sm">This UI is built and ready — it will populate automatically once the table lands.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-none flex items-center px-1 py-2">
                <p className="text-xs text-muted-foreground">
                    Blocked content submitted for review. Approve creates a scoped exception (P3&apos;s{' '}
                    <code className="text-[11px]">ContentException</code>) that future validations honor.
                </p>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={fetchQueue} className="h-7 gap-1.5 text-xs">
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto space-y-2">
                {violations.length === 0 && !isLoading && (
                    <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                        No pending violations.
                    </div>
                )}
                {violations.map((v) => (
                    <div key={v.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] font-mono">
                                        {v.rule_id}
                                    </Badge>
                                    {v.severity && (
                                        <Badge
                                            variant={v.severity === 'block' ? 'destructive' : 'secondary'}
                                            className="text-[10px]"
                                        >
                                            {v.severity}
                                        </Badge>
                                    )}
                                </div>
                                {v.excerpt && (
                                    <pre className="mt-1.5 text-[11px] font-mono bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                                        {v.excerpt}
                                    </pre>
                                )}
                                {v.fix_hint && <p className="mt-1.5 text-xs text-muted-foreground">{v.fix_hint}</p>}
                            </div>
                            <div className="flex-none flex items-center gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={actingId === v.id}
                                    onClick={() => act(v.id, 'approve')}
                                    className="h-7 gap-1 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={actingId === v.id}
                                    onClick={() => act(v.id, 'reject')}
                                    className="h-7 gap-1 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                                >
                                    <X className="h-3.5 w-3.5" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
