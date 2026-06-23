'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Terminal,
    Wifi,
    WifiOff,
    Loader2,
    XCircle,
    Trash2,
    FolderOpen,
    ChevronRight,
    ArrowLeft,
} from 'lucide-react';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';
import type { ToolResult } from '../_lib/types';

// ---------------------------------------------------------------------------
// Command parser
// ---------------------------------------------------------------------------

function parseCommand(raw: string): { tool: string; input: Record<string, unknown> } | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed === 'pwd') return { tool: 'Bash', input: { command: 'pwd' } };
    if (trimmed === 'ls') return { tool: 'ListDirectory', input: {} };
    if (trimmed === 'ls -a') return { tool: 'ListDirectory', input: { show_hidden: true } };
    if (trimmed.startsWith('ls ')) return { tool: 'Bash', input: { command: trimmed } };
    if (trimmed === 'sysinfo') return { tool: 'SystemInfo', input: {} };
    if (trimmed === 'screenshot') return { tool: 'Screenshot', input: {} };
    if (trimmed === 'help' || trimmed === 'clear' || trimmed === 'cancel') return null;

    if (trimmed === 'cd' || trimmed.startsWith('cd ')) return { tool: 'Bash', input: { command: trimmed } };

    if (trimmed.startsWith('cat ')) return { tool: 'Read', input: { file_path: trimmed.slice(4).trim() } };
    if (trimmed.startsWith('head ')) return { tool: 'Read', input: { file_path: trimmed.slice(5).trim(), limit: 20 } };

    if (trimmed.startsWith('find ')) {
        return { tool: 'Glob', input: { pattern: trimmed.slice(5).trim(), path: '.' } };
    }
    if (trimmed.startsWith('grep ')) {
        const parts = trimmed.slice(5).trim().split(/\s+/);
        return { tool: 'Grep', input: { pattern: parts[0] || '', path: parts[1] || '.', max_results: 30 } };
    }
    if (trimmed.startsWith('open ')) return { tool: 'OpenPath', input: { path: trimmed.slice(5).trim() } };
    if (trimmed.startsWith('write ')) {
        const rest = trimmed.slice(6).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx === -1) return { tool: 'Write', input: { file_path: rest, content: '' } };
        return { tool: 'Write', input: { file_path: rest.slice(0, spaceIdx), content: rest.slice(spaceIdx + 1) } };
    }

    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.tool) return { tool: parsed.tool, input: parsed.input || {} };
        } catch { /* fall through */ }
    }

    return { tool: 'Bash', input: { command: trimmed, timeout: 15000 } };
}

const HELP_TEXT = `Available commands:
  <any command>     Run as shell command (bash)
  cd <dir>          Change directory (persists in session)
  ls / ls -a        List directory
  cat <file>        Read entire file
  head <file>       Read first 20 lines
  find <pattern>    Find files by glob pattern
  grep <pat> [path] Search file contents
  open <path>       Open in Finder/Explorer
  pwd               Print working directory
  sysinfo           System info
  screenshot        Capture screen
  write <f> <text>  Write text to file
  cancel            Cancel running tasks
  clear             Clear terminal
  help              Show this help
  {"tool":"..."}    Raw JSON tool call`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TerminalLine {
    id: string;
    type: 'input' | 'output' | 'error' | 'info';
    text: string;
    timestamp: Date;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TerminalPage() {
    // Use the shared context — no separate WS connection or auth logic needed
    const { invokeTool, cancelAll: ctxCancelAll, wsConnected, status } = useMatrxLocalContext();

    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [running, setRunning] = useState(false);
    const [cwd, setCwd] = useState('~');

    const termEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Helpers ──────────────────────────────────────────────────────────

    const addLine = useCallback((type: TerminalLine['type'], text: string) => {
        setLines(prev => [
            ...prev,
            { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, text, timestamp: new Date() },
        ]);
    }, []);

    // Auto-scroll
    useEffect(() => {
        termEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    // Focus input on click anywhere in terminal
    const focusInput = useCallback(() => inputRef.current?.focus(), []);

    // Probe cwd once the shared WS is connected
    useEffect(() => {
        if (!wsConnected) return;
        invokeTool('Bash', { command: 'pwd' }).then((result: ToolResult) => {
            const dir = result.output?.trim();
            if (dir && !dir.startsWith('HTTP')) setCwd(dir);
        }).catch(() => { /* ignore */ });
    // Run once when WS connects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsConnected]);

    // ── Cancel ───────────────────────────────────────────────────────────

    const cancelAll = useCallback(() => {
        ctxCancelAll();
        setRunning(false);
        addLine('info', 'Cancelled all running tasks');
    }, [ctxCancelAll, addLine]);

    // ── Execute command ──────────────────────────────────────────────────

    const executeCommand = useCallback(async (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;

        setHistory(prev => {
            const filtered = prev.filter(h => h !== trimmed);
            return [trimmed, ...filtered].slice(0, 100);
        });
        setHistoryIdx(-1);

        addLine('input', `${cwd} $ ${trimmed}`);

        if (trimmed === 'clear') { setLines([]); return; }
        if (trimmed === 'help') { addLine('info', HELP_TEXT); return; }
        if (trimmed === 'cancel') { cancelAll(); return; }

        const parsed = parseCommand(trimmed);
        if (!parsed) {
            addLine('error', 'Unknown command. Type "help" for available commands.');
            return;
        }

        const connected = wsConnected || status === 'connected';
        if (!connected) {
            addLine('error', 'Not connected to Matrx Local. Waiting for connection…');
            return;
        }

        setRunning(true);
        try {
            const result = await invokeTool(parsed.tool, parsed.input);

            if (result.output) {
                addLine(result.type === 'error' ? 'error' : 'output', result.output);
            }

            if (result.metadata?.cwd) {
                setCwd(String(result.metadata.cwd));
            } else if (trimmed.startsWith('cd ') || trimmed === 'cd') {
                const pwdResult = await invokeTool('Bash', { command: 'pwd' });
                const dir = pwdResult.output?.trim();
                if (dir) setCwd(dir);
            }

            if (result.image) {
                addLine('info', `[Image: ${result.image.media_type}]`);
            }
        } catch (err) {
            addLine('error', err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setRunning(false);
        }
    }, [wsConnected, status, cwd, addLine, cancelAll, invokeTool]);

    // ── Key handling ─────────────────────────────────────────────────────

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = inputValue;
            setInputValue('');
            executeCommand(val);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextIdx = Math.min(historyIdx + 1, history.length - 1);
            if (history[nextIdx]) { setHistoryIdx(nextIdx); setInputValue(history[nextIdx]); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = historyIdx - 1;
            if (nextIdx < 0) { setHistoryIdx(-1); setInputValue(''); }
            else { setHistoryIdx(nextIdx); setInputValue(history[nextIdx] || ''); }
            return;
        }
        if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            cancelAll();
            setInputValue('');
        }
    }, [inputValue, history, historyIdx, executeCommand, cancelAll]);

    const connected = wsConnected || status === 'connected';

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-background">
            {/* Top bar */}
            <div className="border-b px-4 py-2 flex items-center gap-3 shrink-0">
                <Link href="/demos/local-tools">
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
                        <ArrowLeft className="w-3 h-3" /> Dashboard
                    </Button>
                </Link>
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Matrx Local Terminal</span>

                <div className="flex items-center gap-2 ml-4">
                    {connected ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <Wifi className="w-3 h-3" /> Connected {wsConnected ? '(WS)' : '(REST)'}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <WifiOff className="w-3 h-3" /> Disconnected
                        </span>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {running && (
                        <Button size="sm" variant="destructive" onClick={cancelAll} className="h-7 text-xs px-2 gap-1">
                            <XCircle className="w-3 h-3" /> Cancel
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setLines([])} className="h-7 text-xs px-2 gap-1">
                        <Trash2 className="w-3 h-3" /> Clear
                    </Button>
                </div>
            </div>

            {/* Terminal body */}
            <div
                className="flex-1 overflow-y-auto bg-zinc-950 text-zinc-100 font-mono text-sm p-4 cursor-text"
                onClick={focusInput}
            >
                {lines.length === 0 && (
                    <div className="text-zinc-500 mb-2">
                        Matrx Local Terminal — type &quot;help&quot; for commands, &quot;cancel&quot; or Ctrl+C to abort
                    </div>
                )}

                {lines.map((line) => (
                    <div
                        key={line.id}
                        className={`whitespace-pre-wrap break-all leading-relaxed ${
                            line.type === 'input'   ? 'text-green-400'
                            : line.type === 'error'  ? 'text-red-400'
                            : line.type === 'info'   ? 'text-zinc-500'
                            : 'text-zinc-200'
                        }`}
                    >
                        {line.text}
                    </div>
                ))}

                {running && (
                    <div className="flex items-center gap-2 text-yellow-500 mt-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs">Running… (type &quot;cancel&quot; or Ctrl+C to abort)</span>
                    </div>
                )}

                <div className="flex items-center gap-0 mt-1">
                    <span className="text-blue-400 shrink-0 flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {cwd.replace(/^\/Users\/[^/]+/, '~')}
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-600 mx-1 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent outline-none text-zinc-100 caret-green-400"
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>

                <div ref={termEndRef} />
            </div>
        </div>
    );
}
