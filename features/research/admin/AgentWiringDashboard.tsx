'use client';

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SurfaceRuntimeProvider } from '@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext';
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from '@/features/surfaces/manifests/admin-knowledge.manifest';
import {
    RefreshCw, Check, Copy, ExternalLink, ChevronDown, ChevronUp,
    Loader2, AlertCircle, CheckCircle2, Edit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import MatrxMiniLoader from '@/components/loaders/MatrxMiniLoader';
import { ReadFailure } from '@ai-matrx/design-system';
import type { ResearchTemplate } from '../types';
import type { PromptBuiltinRef, AgentConfigKey } from './types';
import {
    AGENT_CONFIG_KEYS,
    AGENT_CONFIG_META,
    SYSTEM_CONSTANTS,
    jsonToAgentConfigStrings,
} from './types';
import {
    fetchTemplates, updateTemplateAgentConfig, resolveBuiltinNames,
} from './service';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { } from '@ai-matrx/chat/agents/redux/agent-definition/selectors';
import { } from '@ai-matrx/chat/agents/redux/agent-definition/thunks';
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { UntrustedCount } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { useBuiltinAgents } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";
import { ensureAgentCatalog } from "@ai-matrx/chat/agents/identity/agent-identity";

const SYSTEM_AGENT_TAB = ['system'] as const;

export function AgentWiringDashboard() {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
    const dispatch = useAppDispatch();
    const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
    const [builtinNames, setBuiltinNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
    const [editingCell, setEditingCell] = useState<{ templateId: string; key: AgentConfigKey } | null>(null);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const { toast } = useToast();

    // Canonical agent listing (THE CANONICAL-SELECTION LAW): builtins come from
    // the agent-definition slice, never a raw agent.definition query.
    const builtinAgents = useBuiltinAgents();
    const builtins = useMemo<PromptBuiltinRef[]>(
        () =>
            builtinAgents
                .filter(a => a.isActive && !a.isArchived && !!a.name)
                .map(a => ({ id: a.id, name: a.name as string, is_active: true }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [builtinAgents],
    );
    useEffect(() => { ensureAgentCatalog(); }, [dispatch]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const templatesData = await fetchTemplates();
            setTemplates(templatesData);

            const allIds = [
                ...templatesData.flatMap(t => Object.values(jsonToAgentConfigStrings(t.agent_config))),
                ...SYSTEM_CONSTANTS.map(c => c.defaultValue),
            ].filter((v): v is string => typeof v === 'string' && v.length > 0);

            const uniqueIds = [...new Set(allIds)];
            if (uniqueIds.length > 0) {
                const names = await resolveBuiltinNames(uniqueIds);
                setBuiltinNames(names);
            }
            setLoadError(null);
        } catch (err) {
            // Said once, in the list (ReadFailure / StaleDataNotice) — no toast too.
            setLoadError(err ?? true);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAgentChange = async (templateId: string, key: AgentConfigKey, value: string) => {
        setSaving(true);
        try {
            await updateTemplateAgentConfig(templateId, key, value === '__none__' ? null : value);
            toast({ title: 'Updated', description: `Agent config updated for ${AGENT_CONFIG_META[key].label}` });
            setEditingCell(null);
            await loadData();
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const copyId = async (id: string) => {
        if (!(await copyText(id))) return;
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleTemplate = (id: string) => {
        setExpandedTemplates(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const getOverallStatus = (template: ResearchTemplate): 'full' | 'partial' | 'none' => {
        const config = jsonToAgentConfigStrings(template.agent_config);
        const wired = AGENT_CONFIG_KEYS.filter(k => config[k] && config[k].length > 0).length;
        if (wired === AGENT_CONFIG_KEYS.length) return 'full';
        if (wired > 0) return 'partial';
        return 'none';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <MatrxMiniLoader />
            </div>
        );
    }

    return (
        <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: 'research_system', research_admin_tab: 'agents', research_templates: templates, research_builtin_agents: builtins })}>
        <ScrollArea className="h-full">
            <div className="p-4 sm:p-6 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Agent Wiring Dashboard</h2>
                        <p className="type-body text-muted-foreground mt-1">
                            View and manage agent assignments across all templates. Each agent role can use a different prompt builtin per template.
                        </p>
                    </div>
                    <Button icon={<RefreshCw />} variant="outline" onClick={loadData}>
                        Refresh
                    </Button>
                </div>

                {/* System Constants */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="px-4 py-3 border-b border-border">
                        <h3 className="type-title">System-Wide Fallback Constants</h3>
                        <p className="type-secondary text-muted-foreground mt-0.5">
                            These are hardcoded in the Python backend as last-resort fallbacks. They cannot be changed from the UI — update <code className="type-meta bg-muted px-1 rounded">analysis.py</code> directly.
                        </p>
                    </div>
                    <div className="divide-y divide-border">
                        {SYSTEM_CONSTANTS.map(constant => (
                            <div key={constant.key} className="flex items-center gap-4 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <code className="type-secondary font-mono bg-muted px-1.5 py-0.5 rounded">{constant.key}</code>
                                        <Badge variant="outline" className="text-[10px]">{constant.module}</Badge>
                                    </div>
                                    <p className="type-secondary text-muted-foreground mt-1">{constant.description}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                        <div className="type-secondary font-medium">
                                            {builtinNames[constant.defaultValue] ?? 'Unknown builtin'}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <code className="type-meta text-muted-foreground">{constant.defaultValue.slice(0, 12)}...</code>
                                            <button onClick={() => copyId(constant.defaultValue)} className="p-0.5 hover:bg-muted rounded">
                                                {copiedId === constant.defaultValue
                                                    ? <Check className="h-3 w-3 text-green-500" />
                                                    : <Copy className="h-3 w-3 text-muted-foreground" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Agent Role Overview */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="px-4 py-3 border-b border-border">
                        <h3 className="type-title">Agent Roles</h3>
                        <p className="type-secondary text-muted-foreground mt-0.5">
                            The 7 agent config keys that each template can customize. Hover for details.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
                        {AGENT_CONFIG_KEYS.map(key => {
                            const templatesUsing = templates.filter(t => {
                                const config = jsonToAgentConfigStrings(t.agent_config);
                                return config[key] && config[key].length > 0;
                            });
                            return (
                                <TooltipProvider key={key}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors cursor-help">
                                                <div className="type-secondary font-medium">{AGENT_CONFIG_META[key].label}</div>
                                                <div className="type-meta text-muted-foreground mt-1">{AGENT_CONFIG_META[key].usedBy}</div>
                                                <div className="mt-2 flex items-center gap-1.5">
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            'text-[10px]',
                                                            templatesUsing.length === templates.length
                                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                                : templatesUsing.length > 0
                                                                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                                    : '',
                                                        )}
                                                    >
                                                        <UntrustedCount value={templatesUsing.length} trustworthy={loadError == null} label="Templates using this agent" />/
                                                        <UntrustedCount value={templates.length} trustworthy={loadError == null} label="Templates" /> templates
                                                    </Badge>
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            <p className="type-secondary font-medium">{AGENT_CONFIG_META[key].label}</p>
                                            <p className="type-secondary text-muted-foreground mt-1">{AGENT_CONFIG_META[key].description}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            );
                        })}
                    </div>
                </div>

                {/* Per-Template Wiring */}
                <div className="space-y-3">
                    <h3 className="type-title">Per-Template Agent Configuration</h3>
                    {loadError != null && templates.length > 0 && (
                        <StaleDataNotice hasData what="the research templates" onRetry={() => void loadData()} retrying={loading} />
                    )}

                    {templates.map(template => {
                        const status = getOverallStatus(template);
                        const isExpanded = expandedTemplates.has(template.id);
                        const config = jsonToAgentConfigStrings(template.agent_config);

                        return (
                            <div key={template.id} className="rounded-xl border border-border bg-card overflow-hidden">
                                <button
                                    onClick={() => toggleTemplate(template.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'h-3 w-3 rounded-full shrink-0',
                                            status === 'full' ? 'bg-green-500' : status === 'partial' ? 'bg-yellow-500' : 'bg-zinc-300 dark:bg-zinc-600',
                                        )} />
                                        <span className="type-title">{template.name}</span>
                                        {template.is_system && (
                                            <Badge variant="default" className="text-[10px]">System</Badge>
                                        )}
                                        <Badge variant="secondary" className="text-[10px]">
                                            {AGENT_CONFIG_KEYS.filter(k => config[k]).length}/{AGENT_CONFIG_KEYS.length} wired
                                        </Badge>
                                    </div>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border">
                                        <div className="divide-y divide-border">
                                            {AGENT_CONFIG_KEYS.map(key => {
                                                const val = config[key];
                                                const isEditing = editingCell?.templateId === template.id && editingCell?.key === key;

                                                return (
                                                    <div key={key} className="flex items-center gap-3 px-4 py-2.5">
                                                        <div className={cn(
                                                            'h-2 w-2 rounded-full shrink-0',
                                                            val ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600',
                                                        )} />
                                                        <div className="w-44 shrink-0">
                                                            <span className="type-secondary font-medium">{AGENT_CONFIG_META[key].label}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            {isEditing ? (
                                                                <div className="flex items-center gap-2">
                                                                    <AgentListDropdown
                                                                        consumerId={`research-agent-wiring-${template.id}-${key}`}
                                                                        onSelect={agentId => void handleAgentChange(template.id, key, agentId)}
                                                                        activeAgentId={val ?? null}
                                                                        label={val ? (builtinNames[val] ?? 'Select system agent') : 'System default'}
                                                                        initialTab="system"
                                                                        visibleTabs={SYSTEM_AGENT_TAB}
                                                                        systemTabLabel="System"
                                                                        showPinnedAgent={Boolean(val)}
                                                                        triggerSlot={
                                                                            <Button
                                                                                iconEnd={<ChevronDown />}
                                                                                type="button"
                                                                                variant="outline"
                                                                                className="min-w-0 flex-1 justify-between"
                                                                                disabled={saving}
                                                                            >
                                                                                <span className="truncate">{val ? (builtinNames[val] ?? 'Select system agent') : 'System default'}</span>
                                                                            </Button>
                                                                        }
                                                                    />
                                                                    {val && !saving && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="quiet"
                                                                            onClick={() => void handleAgentChange(template.id, key, '__none__')}
                                                                        >
                                                                            Default
                                                                        </Button>
                                                                    )}
                                                                    {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <span className={cn(
                                                                        'type-secondary truncate',
                                                                        val ? 'text-foreground' : 'text-muted-foreground',
                                                                    )}>
                                                                        {val ? (builtinNames[val] ?? val.slice(0, 12) + '...') : 'Using system default'}
                                                                    </span>
                                                                    {val && (
                                                                        <button onClick={() => copyId(val)} className="p-0.5 hover:bg-muted rounded shrink-0">
                                                                            {copiedId === val
                                                                                ? <Check className="h-3 w-3 text-green-500" />
                                                                                : <Copy className="h-3 w-3 text-muted-foreground" />
                                                                            }
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {!isEditing && (
                                                            <Button
                                                                icon={<Edit2 />} aria-label="Edit"
                                                                variant="quiet"
                                                                className="shrink-0"
                                                                onClick={() => setEditingCell({ templateId: template.id, key })}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {loadError != null && templates.length === 0 && (
                        <ReadFailure error={loadError} what="the research templates" onRetry={() => void loadData()} />
                    )}

                    {loadError == null && templates.length === 0 && (
                        <div className="text-center text-muted-foreground py-12 type-body">
                            No templates found. Create templates in the Templates tab first.
                        </div>
                    )}
                </div>
            </div>
        </ScrollArea>
        </SurfaceRuntimeProvider>
    );
}
