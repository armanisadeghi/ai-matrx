'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Loader2,
    Play,
    RefreshCw,
    Square,
    Terminal,
    Trash2,
} from 'lucide-react';
import { ConnectionBar } from '../_lib/ConnectionBar';
import { MessageLog } from '../_lib/ResultPanel';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';
import type { UseMatrxLocalReturn } from '../_lib/useMatrxLocal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveShell {
    id: string;
    shellId: string;
    command: string;
    startedAt: Date;
    output: string;
    status: 'running' | 'stopped' | 'error';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShellPage() {
    const local = useMatrxLocalContext();
    const { invokeTool, loading, logs, clearLogs } = local;
    const isDisabled = !!loading;

    // Foreground Bash
    const [bashCommand, setBashCommand] = useState('uname -a && uptime');
    const [bashTimeout, setBashTimeout] = useState(30);
    const [bashResult, setBashResult] = useState<string | null>(null);
    const [bashLoading, setBashLoading] = useState(false);

    // Background shells
    const [bgCommand, setBgCommand] = useState('ping -c 10 google.com');
    const [activeShells, setActiveShells] = useState<ActiveShell[]>([]);
    const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
    const pollIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

    // ----- Foreground Bash -----

    const runBash = async () => {
        if (!bashCommand.trim()) return;
        setBashLoading(true);
        setBashResult(null);
        try {
            const result = await invokeTool('Bash', {
                command: bashCommand,
                timeout: bashTimeout * 1000,
            }, bashTimeout * 1000 + 5000);
            setBashResult(result.output);
        } finally {
            setBashLoading(false);
        }
    };

    // ----- Background shells -----

    const launchBackground = async () => {
        if (!bgCommand.trim()) return;
        const result = await invokeTool('Bash', {
            command: bgCommand,
            background: true,
        });

        // Extract shell_id from output (format: "Started background shell: <id>")
        const match = result.output.match(/shell[_\s]id[:\s]+(\S+)/i) ??
            result.output.match(/([a-zA-Z0-9_-]{6,})/);
        const shellId = match?.[1] ?? `shell-${Date.now()}`;

        const shell: ActiveShell = {
            id: `active-${Date.now()}`,
            shellId,
            command: bgCommand,
            startedAt: new Date(),
            output: result.output,
            status: result.type === 'error' ? 'error' : 'running',
        };

        setActiveShells(prev => [shell, ...prev]);
        if (shell.status === 'running') {
            startPolling(shell);
        }
    };

    const startPolling = useCallback((shell: ActiveShell) => {
        const interval = setInterval(async () => {
            try {
                const result = await invokeTool('BashOutput', { shell_id: shell.shellId });
                setActiveShells(prev =>
                    prev.map(s =>
                        s.id === shell.id
                            ? { ...s, output: s.output + '\n' + result.output, status: result.type === 'error' ? 'stopped' : 'running' }
                            : s
                    )
                );
                if (result.type === 'error' || result.output.includes('[done]') || result.output.includes('[exited]')) {
                    clearInterval(interval);
                    pollIntervals.current.delete(shell.id);
                    setPollingIds(prev => { const n = new Set(prev); n.delete(shell.id); return n; });
                    setActiveShells(prev =>
                        prev.map(s => s.id === shell.id ? { ...s, status: 'stopped' } : s)
                    );
                }
            } catch {
                clearInterval(interval);
                pollIntervals.current.delete(shell.id);
            }
        }, 2000);

        pollIntervals.current.set(shell.id, interval);
        setPollingIds(prev => new Set([...prev, shell.id]));
    }, [invokeTool]);

    const refreshShell = async (shell: ActiveShell) => {
        const result = await invokeTool('BashOutput', { shell_id: shell.shellId });
        setActiveShells(prev =>
            prev.map(s => s.id === shell.id ? { ...s, output: result.output } : s)
        );
    };

    const stopShell = async (shell: ActiveShell) => {
        // Stop polling
        const interval = pollIntervals.current.get(shell.id);
        if (interval) {
            clearInterval(interval);
            pollIntervals.current.delete(shell.id);
        }
        setPollingIds(prev => { const n = new Set(prev); n.delete(shell.id); return n; });

        // Send TaskStop
        await invokeTool('TaskStop', { shell_id: shell.shellId });
        setActiveShells(prev =>
            prev.map(s => s.id === shell.id ? { ...s, status: 'stopped' } : s)
        );
    };

    const removeShell = (id: string) => {
        const interval = pollIntervals.current.get(id);
        if (interval) clearInterval(interval);
        pollIntervals.current.delete(id);
        setPollingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setActiveShells(prev => prev.filter(s => s.id !== id));
    };

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            {/* Header strip */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
                <Link href="/demos/local-tools">
                    <Button variant="ghost" size="sm" className="gap-1 h-6 text-xs px-1.5">
                        <ArrowLeft className="w-3 h-3" />
                        Back
                    </Button>
                </Link>
                <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm font-semibold">Shell Execution</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                    Bash · background processes · BashOutput · TaskStop
                </span>
            </div>
            <div className="shrink-0 border-b px-3 py-1">
                <ConnectionBar hook={local} />
            </div>
            <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 border-r">
                <div className="space-y-3">

                    {/* Foreground Bash */}
                    <div className="border rounded-lg p-3 bg-card space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Bash (foreground)</span>
                            <span className="text-[10px] text-muted-foreground">— execute a command and wait for output</span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={bashCommand}
                                onChange={e => setBashCommand(e.target.value)}
                                className="flex-1 h-8 text-xs font-mono rounded border px-2 bg-background"
                                placeholder="ls -la"
                                style={{ fontSize: '16px' }}
                                onKeyDown={e => e.key === 'Enter' && runBash()}
                            />
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Timeout (s):</span>
                                <input
                                    type="number"
                                    value={bashTimeout}
                                    onChange={e => setBashTimeout(Number(e.target.value))}
                                    className="w-16 h-8 text-xs rounded border px-2 bg-background"
                                    min={1}
                                    max={300}
                                    style={{ fontSize: '16px' }}
                                />
                            </div>
                            <Button size="sm" disabled={isDisabled || bashLoading || !bashCommand.trim()} onClick={runBash} className="gap-1.5 shrink-0">
                                {bashLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                Run
                            </Button>
                        </div>
                        {bashLoading && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Running…
                            </div>
                        )}
                        {bashResult && (
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-zinc-950 text-green-400 rounded p-3 max-h-64 overflow-y-auto">
                                {bashResult}
                            </pre>
                        )}
                    </div>

                    {/* Background shells */}
                    <div className="border rounded-lg p-3 bg-card space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Background Shell</span>
                            <span className="text-[10px] text-muted-foreground">— launch long-running commands, poll output, stop them</span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={bgCommand}
                                onChange={e => setBgCommand(e.target.value)}
                                className="flex-1 h-8 text-xs font-mono rounded border px-2 bg-background"
                                placeholder="ping -c 20 google.com"
                                style={{ fontSize: '16px' }}
                                onKeyDown={e => e.key === 'Enter' && launchBackground()}
                            />
                            <Button size="sm" disabled={isDisabled || !bgCommand.trim()} onClick={launchBackground} className="gap-1.5 shrink-0">
                                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                Launch
                            </Button>
                        </div>

                        {activeShells.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                                No active shells. Launch one above.
                            </p>
                        )}

                        <div className="space-y-3">
                            {activeShells.map(shell => (
                                <div key={shell.id} className="border rounded-lg overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] h-4 px-1 ${
                                                shell.status === 'running'
                                                    ? 'text-green-600 border-green-500'
                                                    : shell.status === 'error'
                                                    ? 'text-red-500 border-red-400'
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            {shell.status === 'running' && pollingIds.has(shell.id) && (
                                                <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />
                                            )}
                                            {shell.status}
                                        </Badge>
                                        <code className="text-[11px] font-mono flex-1 truncate">{shell.command}</code>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {shell.startedAt.toLocaleTimeString()}
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0"
                                                onClick={() => refreshShell(shell)}
                                                title="Read latest output"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                            </Button>
                                            {shell.status === 'running' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                                                    onClick={() => stopShell(shell)}
                                                    title="Stop process"
                                                >
                                                    <Square className="w-3 h-3" />
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0 text-muted-foreground"
                                                onClick={() => removeShell(shell.id)}
                                                title="Remove"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground px-3 py-1 border-b bg-muted/20">
                                        shell_id: <code className="font-mono">{shell.shellId}</code>
                                    </div>
                                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-zinc-950 text-green-400 p-3 max-h-48 overflow-y-auto">
                                        {shell.output || '(no output yet)'}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Manual BashOutput / TaskStop */}
                    <div className="border rounded-lg p-3 bg-card space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Manual Control</span>
                            <span className="text-[10px] text-muted-foreground">— call BashOutput or TaskStop with a shell_id</span>
                        </div>
                        <ManualControl local={local} />
                    </div>
                </div>
            </div>
            {/* Message log — full-height right column */}
            <div className="w-80 shrink-0 flex flex-col overflow-hidden">
                <MessageLog logs={logs} onClear={clearLogs} className="flex-1 rounded-none border-0" maxHeight="max-h-full" />
            </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Manual control sub-component
// ---------------------------------------------------------------------------

function ManualControl({ local }: { local: UseMatrxLocalReturn }) {
    const { invokeTool, loading } = local;
    const [shellId, setShellId] = useState('');
    const [result, setResult] = useState<string | null>(null);

    const readOutput = async () => {
        if (!shellId.trim()) return;
        const res = await invokeTool('BashOutput', { shell_id: shellId.trim() });
        setResult(res.output);
    };

    const stopProcess = async () => {
        if (!shellId.trim()) return;
        const res = await invokeTool('TaskStop', { shell_id: shellId.trim() });
        setResult(res.output);
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={shellId}
                    onChange={e => setShellId(e.target.value)}
                    className="flex-1 h-8 text-xs font-mono rounded border px-2 bg-background"
                    placeholder="shell_id"
                    style={{ fontSize: '16px' }}
                />
                <Button size="sm" variant="outline" disabled={!!loading || !shellId.trim()} onClick={readOutput} className="gap-1">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Read Output
                </Button>
                <Button size="sm" variant="destructive" disabled={!!loading || !shellId.trim()} onClick={stopProcess} className="gap-1">
                    <Square className="w-3 h-3" />
                    Stop
                </Button>
            </div>
            {result && (
                <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-zinc-950 text-green-400 rounded p-3 max-h-48 overflow-y-auto">
                    {result}
                </pre>
            )}
        </div>
    );
}
