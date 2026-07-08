'use client';

import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, DollarSign, Zap, Settings2, FileText } from 'lucide-react';
import type { AuditCategory, ModelAuditResult } from './auditTypes';

interface CategoryStat {
    category: AuditCategory;
    label: string;
    icon: React.ReactNode;
    pass: number;
    fail: number;
    total: number;
}

interface AuditSummaryBarProps {
    results: ModelAuditResult[];
    activeCategory: AuditCategory | 'overview';
    onCategoryClick: (cat: AuditCategory | 'overview') => void;
}

const CATEGORY_META: Record<AuditCategory, { label: string; icon: React.ReactNode }> = {
    pricing: { label: 'Pricing', icon: <DollarSign className="h-4 w-4" /> },
    capabilities: { label: 'Capabilities', icon: <Zap className="h-4 w-4" /> },
    configurations: { label: 'Configurations', icon: <Settings2 className="h-4 w-4" /> },
    core_fields: { label: 'Core Fields', icon: <FileText className="h-4 w-4" /> },
};

export default function AuditSummaryBar({ results, activeCategory, onCategoryClick }: AuditSummaryBarProps) {
    const totalPass = results.filter((r) => r.pass).length;
    const totalFail = results.length - totalPass;
    const overallPct = results.length > 0 ? Math.round((totalPass / results.length) * 100) : 0;

    const categories: AuditCategory[] = ['core_fields', 'pricing', 'capabilities', 'configurations'];

    const stats: CategoryStat[] = categories.map((cat) => {
        const pass = results.filter((r) => r.categoryPass[cat]).length;
        const fail = results.length - pass;
        return {
            category: cat,
            label: CATEGORY_META[cat].label,
            icon: CATEGORY_META[cat].icon,
            pass,
            fail,
            total: results.length,
        };
    });

    const pct = (pass: number, total: number) =>
        total > 0 ? Math.round((pass / total) * 100) : 100;

    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0 overflow-x-auto">
            {/* Overall card */}
            <button
                onClick={() => onCategoryClick('overview')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left shrink-0 ${
                    activeCategory === 'overview'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
            >
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap">Overall</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold leading-none text-foreground">{overallPct}%</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">pass</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {totalPass}/{results.length} models
                    </span>
                </div>
                <div className="flex items-center shrink-0">
                    {totalFail > 0 ? (
                        <span className="flex items-center gap-0.5 text-destructive text-xs font-medium whitespace-nowrap">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            {totalFail}
                        </span>
                    ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                </div>
            </button>

            <div className="w-px bg-border self-stretch shrink-0" />

            {/* Per-category cards */}
            {stats.map((stat) => {
                const p = pct(stat.pass, stat.total);
                const isActive = activeCategory === stat.category;
                const color = p === 100 ? 'text-green-600' : p >= 70 ? 'text-amber-600' : 'text-destructive';
                const bgActive = p === 100 ? 'border-green-400 bg-green-50 dark:bg-green-900/20' :
                    p >= 70 ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                        'border-destructive/50 bg-destructive/5';

                return (
                    <button
                        key={stat.category}
                        onClick={() => onCategoryClick(stat.category)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left shrink-0 ${
                            isActive ? bgActive : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }`}
                    >
                        <div className={`shrink-0 ${isActive ? color : 'text-muted-foreground'}`}>
                            {stat.icon}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap">
                                {stat.label}
                            </span>
                            <span className={`text-base font-bold leading-none ${color}`}>{p}%</span>
                            <div className="flex items-center gap-1">
                                {stat.fail > 0 ? (
                                    <>
                                        <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{stat.fail} issues</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">All pass</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
