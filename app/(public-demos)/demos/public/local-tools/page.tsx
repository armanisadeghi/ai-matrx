'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Activity,
    ChevronRight,
    Cloud,
    FileText,
    FolderOpen,
    Globe,
    Loader2,
    Monitor,
    Send,
    Settings2,
    Terminal,
    Wifi,
    Zap,
} from 'lucide-react';
import { ConnectionBar } from './_lib/ConnectionBar';
import { MessageLog, ResultPanel } from './_lib/ResultPanel';
import { useMatrxLocalContext } from './_lib/MatrxLocalContext';
import { ALL_TOOLS } from './_lib/constants';
import type { ToolResult } from './_lib/types';

// ---------------------------------------------------------------------------
// Navigation cards
// ---------------------------------------------------------------------------

const SUB_PAGES = [
    {
        href: '/demos/local-tools/scraper',
        icon: Globe,
        label: 'Scraper Engine',
        description: 'Scrape, Search & Research with residential IP + anti-bot',
        badge: 'New',
    },
    {
        href: '/demos/local-tools/files',
        icon: FileText,
        label: 'File Operations',
        description: 'Read, Write, Edit, Glob, Grep, Download, Upload',
    },
    {
        href: '/demos/local-tools/system',
        icon: Monitor,
        label: 'System Tools',
        description: 'SystemInfo, Screenshot, Clipboard, Notify, Open',
    },
    {
        href: '/demos/local-tools/shell',
        icon: Terminal,
        label: 'Shell Execution',
        description: 'Bash, background processes, BashOutput, TaskStop',
    },
    {
        href: '/demos/local-tools/terminal',
        icon: FolderOpen,
        label: 'Terminal',
        description: 'Interactive shell-like terminal interface',
    },
    {
        href: '/demos/local-tools/documents',
        icon: FileText,
        label: 'Documents & Notes',
        description: 'Folders, notes, sync, versions, conflicts, shares',
        badge: 'New',
    },
    {
        href: '/demos/local-tools/cloud-sync',
        icon: Cloud,
        label: 'Cloud Sync',
        description: 'Configure cloud sync, settings, push/pull',
        badge: 'New',
    },
    {
        href: '/demos/local-tools/engine',
        icon: Settings2,
        label: 'Engine Settings',
        description: 'Health, version, ports, engine configuration',
        badge: 'New',
    },
    {
        href: '/demos/local-tools/powershell',
        icon: Zap,
        label: 'PowerShell Tools',
        description: 'Env vars · Registry · Services · Event Log · Windows Features',
        badge: 'New',
    },
] as const;

// ---------------------------------------------------------------------------
// Quick presets
// ---------------------------------------------------------------------------

type QuickPreset =
    | { label: string; tool: string; input: Record<string, unknown>; sequence?: never }
    | { label: string; tool?: never; input?: never; sequence: { tool: string; input: Record<string, unknown> }[] };

const QUICK_PRESETS: QuickPreset[] = [
    { label: 'System Info', tool: 'SystemInfo', input: {} },
    { label: 'List Home', tool: 'ListDirectory', input: { show_hidden: false } },
    { label: 'ls -la', tool: 'Bash', input: { command: 'ls -la', timeout: 10000 } },
    { label: 'Find .py', tool: 'Glob', input: { pattern: '*.py', path: '.' } },
    { label: 'Desktop Screenshot', tool: 'Screenshot', input: {} },
    {
        label: 'Browser Screenshot',
        sequence: [
            { tool: 'BrowserNavigate', input: { url: 'https://aimatrx.com' } },
            { tool: 'BrowserScreenshot', input: {} },
        ],
    },
    { label: 'Clipboard', tool: 'ClipboardRead', input: {} },
    {
        label: 'Scrape Example',
        tool: 'Scrape',
        input: { urls: ['https://httpbin.org/html'], use_cache: false },
    },
    {
        label: 'Fetch URL',
        tool: 'FetchUrl',
        input: { url: 'https://httpbin.org/get' },
    },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LocalToolsDemo() {
    const local = useMatrxLocalContext();
    const { invokeTool, loading, logs, clearLogs, availableTools } = local;

    const [activeResult, setActiveResult] = useState<ToolResult | null>(null);
    const [customTool, setCustomTool] = useState('Bash');
    const [customInput, setCustomInput] = useState('{"command": "echo hello"}');

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const runTool = async (tool: string, input: Record<string, unknown>) => {
        setActiveResult(null);
        const result = await invokeTool(tool, input);
        setActiveResult(result);
    };

    const runCustom = () => {
        try {
            runTool(customTool, JSON.parse(customInput));
        } catch {
            setActiveResult({ type: 'error', output: 'Invalid JSON input' });
        }
    };

    // Only block while a tool call is in-flight — WS not connected just means REST fallback is used
    const isDisabled = !!loading;

    // A tool is "available" if we haven't fetched the server list yet (show all),
    // or if it's confirmed in the server's list.
    const isToolAvailable = (tool: string) =>
        availableTools.length === 0 || availableTools.includes(tool);

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            <div className="shrink-0 border-b px-3 py-1">
                <ConnectionBar hook={local} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
                <div className="max-w-screen-2xl mx-auto space-y-3">

                    {/* Navigation Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            {SUB_PAGES.map((page) => {
                                const Icon = page.icon;
                                return (
                                    <Link key={page.href} href={page.href}>
                                        <div className="border rounded-lg p-2.5 bg-card hover:bg-accent transition-colors cursor-pointer group">
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                                                    <span className="text-xs font-medium truncate">{page.label}</span>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {'badge' in page && (
                                                        <Badge variant="default" className="text-[9px] h-3.5 px-1">
                                                            {page.badge}
                                                        </Badge>
                                                    )}
                                                    <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-5 leading-tight">
                                                {page.description}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                    </div>

                    {/* Quick presets */}
                    <div className="border rounded-lg p-2.5 bg-card">
                        <h2 className="text-[10px] font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">
                            Quick Fire
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {QUICK_PRESETS.map((preset) => {
                                if (preset.sequence) {
                                    const tools = preset.sequence.map(s => s.tool);
                                    const allAvailable = tools.every(t => isToolAvailable(t));
                                    const isRunning = typeof loading === 'string' && tools.some(t => loading.startsWith(`${t}-`));
                                    return (
                                        <Button
                                            key={`sequence-${preset.label}`}
                                            variant="outline"
                                            size="sm"
                                            className={`h-7 text-xs ${!allAvailable ? 'opacity-40' : ''}`}
                                            disabled={isDisabled || !allAvailable}
                                            title={!allAvailable ? `One or more tools (${tools.join(', ')}) are not available on this engine version` : `Runs: ${tools.join(' → ')}`}
                                            onClick={async () => {
                                                setActiveResult(null);
                                                for (const step of preset.sequence) {
                                                    const result = await invokeTool(step.tool, step.input);
                                                    setActiveResult(result);
                                                    if (result.type === 'error') break;
                                                }
                                            }}
                                        >
                                            {isRunning && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                            {preset.label}
                                        </Button>
                                    );
                                }

                                const available = isToolAvailable(preset.tool);
                                return (
                                    <Button
                                        key={`${preset.tool}-${preset.label}`}
                                        variant="outline"
                                        size="sm"
                                        className={`h-7 text-xs ${!available ? 'opacity-40' : ''}`}
                                        disabled={isDisabled || !available}
                                        title={!available ? `${preset.tool} is not available on this engine version` : undefined}
                                        onClick={() => runTool(preset.tool, preset.input)}
                                    >
                                        {typeof loading === 'string' && loading.startsWith(`${preset.tool}-`) && (
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        )}
                                        {preset.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom tool invocation */}
                    <div className="border rounded-lg p-2.5 bg-card space-y-2">
                        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Custom Tool Call
                        </h2>
                        <div className="flex gap-2 flex-wrap">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground">Tool</label>
                                <select
                                    value={customTool}
                                    onChange={(e) => setCustomTool(e.target.value)}
                                    className="h-8 text-xs font-mono rounded border px-2 bg-background"
                                >
                                    {ALL_TOOLS.map((t) => (
                                        <option
                                            key={t}
                                            value={t}
                                            disabled={availableTools.length > 0 && !availableTools.includes(t)}
                                        >
                                            {t}{availableTools.length > 0 && !availableTools.includes(t) ? ' (unavailable)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                                <label className="text-xs text-muted-foreground">Input (JSON)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        className="h-8 text-xs font-mono rounded border px-2 bg-background flex-1"
                                        placeholder='{"command": "echo hello"}'
                                        onKeyDown={(e) => e.key === 'Enter' && runCustom()}
                                    />
                                    <Button
                                        size="sm"
                                        className="h-8 px-3"
                                        disabled={isDisabled}
                                        onClick={runCustom}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Send className="w-3 h-3 mr-1" />
                                        )}
                                        Send
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Result + Log */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <ResultPanel result={activeResult} loading={!!loading} />
                        <div>
                            <MessageLog logs={logs} onClear={clearLogs} />
                            <div ref={logEndRef} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection info footer */}
            <div className="shrink-0 border-t bg-card px-3 py-1 flex items-center gap-4 text-[10px] text-muted-foreground font-mono overflow-x-auto">
                <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3 shrink-0" />
                    <span className="text-foreground/60">REST</span>
                    <span className="truncate max-w-48">{local.baseUrl}/tools/invoke</span>
                </span>
                <span className="shrink-0">·</span>
                <span className="truncate max-w-48">{local.baseUrl.replace(/^http/, 'ws')}/ws</span>
                <span className="shrink-0">·</span>
                <span className="shrink-0">{local.useWebSocket ? 'WebSocket' : 'REST'}</span>
                <span className="shrink-0">·</span>
                <span className="shrink-0">{logs.length} msgs</span>
            </div>
        </div>
    );
}
