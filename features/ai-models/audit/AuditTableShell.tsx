'use client';

/**
 * Shared table shell + row types reused by each audit tab.
 */

import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AuditIssue } from './auditTypes';
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

export function StatusBadge({ pass }: { pass: boolean }) {
    return pass ? (
        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pass
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
            <XCircle className="h-3.5 w-3.5" /> Fail
        </span>
    );
}

export function IssueList({ issues }: { issues: AuditIssue[] }) {
    if (issues.length === 0) return null;
    return (
        <div className="flex flex-col gap-0.5">
            {issues.map((issue, i) => (
                <span
                    key={i}
                    className={`text-[10px] flex items-center gap-1 ${
                        issue.severity === 'error' ? 'text-destructive' : 'text-amber-600'
                    }`}
                >
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    {issue.message}
                </span>
            ))}
        </div>
    );
}

export function ProviderBadge({ provider }: { provider: string | null }) {
    if (!provider) return <span className="text-muted-foreground/50 text-xs">—</span>;
    return <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">{provider}</Badge>;
}

export function ModelNameCell({ name, commonName }: { name: string; commonName: string | null }) {
    return (
        <div className="min-w-0">
            <div className="font-medium text-xs truncate" title={commonName || name}>
                {commonName || name}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">{name}</div>
        </div>
    );
}

interface AuditTableShellProps {
    children: React.ReactNode;
    headers: React.ReactNode;
    empty?: React.ReactNode;
    isEmpty?: boolean;
}

export function AuditTableShell({ children, headers, empty, isEmpty }: AuditTableShellProps) {
    return (
        <div className="flex-1 overflow-auto min-h-0">
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    {empty ?? <p className="text-sm">No models to show</p>}
                </div>
            ) : (
                <table className={cn("text-xs border-collapse", MOBILE_TABLE_FROZEN)}>
                    <thead className="sticky top-0 z-10 bg-card border-b">
                        <tr className="h-8">{headers}</tr>
                    </thead>
                    <tbody>{children}</tbody>
                </table>
            )}
        </div>
    );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
    return (
        <th className={`px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap ${className}`}>
            {children}
        </th>
    );
}
