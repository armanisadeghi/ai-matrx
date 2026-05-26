'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import type { LogEntry, ToolResult } from './types';

// ---------------------------------------------------------------------------
// Result Panel
// ---------------------------------------------------------------------------

interface ResultPanelProps {
    result: ToolResult | null;
    loading: boolean;
    title?: string;
    maxHeight?: string;
}

export function ResultPanel({ result, loading, title = 'Result', maxHeight = 'max-h-[400px]' }: ResultPanelProps) {
    return (
        <div className="border rounded-lg flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
                <h2 className="text-xs font-semibold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    {title}
                </h2>
                {result && (
                    <Badge
                        variant={result.type === 'success' ? 'outline' : 'destructive'}
                        className="text-[10px] h-5"
                    >
                        {result.type}
                    </Badge>
                )}
            </div>
            <div className={`flex-1 min-h-0 ${maxHeight} overflow-y-auto`}>
                {loading && (
                    <div className="flex items-center justify-center p-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}
                {!loading && result && (
                    <div className="p-3 space-y-3">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
                            {result.output}
                        </pre>
                        {result.image && (
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Image:</p>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`data:${result.image.media_type};base64,${result.image.base64_data}`}
                                    alt="Tool result"
                                    className="max-w-full rounded border"
                                />
                            </div>
                        )}
                        {result.metadata && (
                            <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                                    <ChevronDown className="w-3 h-3" />
                                    Metadata
                                </summary>
                                <pre className="mt-1 p-2 bg-muted rounded font-mono text-[10px] overflow-auto max-h-40">
                                    {JSON.stringify(result.metadata, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                )}
                {!loading && !result && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                        Run a tool to see results
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Message Log
// ---------------------------------------------------------------------------

interface MessageLogProps {
    logs: LogEntry[];
    onClear: () => void;
    maxHeight?: string;
    className?: string;
}

export function MessageLog({ logs, onClear, maxHeight = 'max-h-[400px]', className = '' }: MessageLogProps) {
    return (
        <div className={`border rounded-lg flex flex-col overflow-hidden ${className}`}>
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
                <h2 className="text-xs font-semibold">Message Log</h2>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={onClear}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear
                </Button>
            </div>
            <div className={`flex-1 min-h-0 ${maxHeight} overflow-y-auto font-mono text-[11px]`}>
                {logs.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground font-sans">
                        Messages will appear here
                    </div>
                )}
                {logs.map((entry) => (
                    <div
                        key={entry.id}
                        className={`px-3 py-1.5 border-b border-border/50 ${
                            entry.direction === 'sent' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <Badge
                                variant="outline"
                                className={`text-[9px] h-4 px-1 ${
                                    entry.direction === 'sent'
                                        ? 'text-blue-600 border-blue-300'
                                        : 'text-green-600 border-green-300'
                                }`}
                            >
                                {entry.direction === 'sent' ? 'SEND' : 'RECV'}
                            </Badge>
                            {entry.tool && <span className="text-muted-foreground">{entry.tool}</span>}
                            <span className="text-muted-foreground ml-auto">
                                {entry.timestamp.toLocaleTimeString()}
                            </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-[10px] max-h-24 overflow-y-auto">
                            {typeof entry.data === 'string'
                                ? entry.data
                                : JSON.stringify(entry.data, null, 2)}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}
