'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    ArrowLeft,
    Download,
    Edit3,
    FileSearch,
    FileText,
    FilePlus,
    Loader2,
    Search,
    Upload,
} from 'lucide-react';
import { ConnectionBar } from '../_lib/ConnectionBar';
import { MessageLog, ResultPanel } from '../_lib/ResultPanel';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';
import type { ToolResult } from '../_lib/types';

export default function FilesPage() {
    const local = useMatrxLocalContext();
    const { invokeTool, loading, logs, clearLogs } = local;

    const [activeResult, setActiveResult] = useState<ToolResult | null>(null);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    const run = async (section: string, tool: string, input: Record<string, unknown>) => {
        setActiveSection(section);
        setActiveResult(null);
        const result = await invokeTool(tool, input);
        setActiveResult(result);
    };

    const [readPath, setReadPath] = useState('~/.matrx/local.json');
    const [readLimit, setReadLimit] = useState('');
    const [writePath, setWritePath] = useState('/tmp/matrx-test.txt');
    const [writeContent, setWriteContent] = useState('Hello from Matrx Local!\n');
    const [editPath, setEditPath] = useState('/tmp/matrx-test.txt');
    const [editOldText, setEditOldText] = useState('Hello');
    const [editNewText, setEditNewText] = useState('Goodbye');
    const [globPattern, setGlobPattern] = useState('**/*.py');
    const [globPath, setGlobPath] = useState('.');
    const [grepPattern, setGrepPattern] = useState('def ');
    const [grepPath, setGrepPath] = useState('.');
    const [grepInclude, setGrepInclude] = useState('*.py');
    const [grepMaxResults, setGrepMaxResults] = useState(20);
    const [downloadUrl, setDownloadUrl] = useState('https://httpbin.org/get');
    const [downloadPath, setDownloadPath] = useState('/tmp/matrx-download.json');
    const [uploadPath, setUploadPath] = useState('/tmp/matrx-test.txt');
    const [uploadUrl, setUploadUrl] = useState('https://httpbin.org/put');

    const inputCls = "w-full h-7 text-xs font-mono rounded border px-2 bg-background";
    const textareaCls = "w-full text-xs font-mono rounded border px-2 py-1 bg-background resize-none";
    const isLoading = (s: string) => !!loading && activeSection === s;

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
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm font-semibold">File Operations</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                    Read · Write · Edit · Glob · Grep · Download · Upload
                </span>
            </div>
            <div className="shrink-0 border-b px-3 py-1">
                <ConnectionBar hook={local} />
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: tool controls ── */}
                <div className="w-64 shrink-0 border-r overflow-y-auto flex flex-col divide-y bg-card">

                    {/* Read */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Read</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">File path</label>
                        <input type="text" value={readPath} onChange={e => setReadPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="~/.matrx/local.json" />
                        <label className="text-[10px] text-muted-foreground">Limit lines (optional)</label>
                        <input type="number" value={readLimit} onChange={e => setReadLimit(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="50" />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('read', 'Read', {
                                file_path: readPath,
                                ...(readLimit ? { limit: Number(readLimit) } : {}),
                            })}>
                            {isLoading('read') ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            Read File
                        </Button>
                    </div>

                    {/* Write */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <FilePlus className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Write</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">File path</label>
                        <input type="text" value={writePath} onChange={e => setWritePath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="/tmp/file.txt" />
                        <label className="text-[10px] text-muted-foreground">Content</label>
                        <textarea value={writeContent} onChange={e => setWriteContent(e.target.value)}
                            rows={3} className={textareaCls} style={{ fontSize: '16px' }} />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('write', 'Write', { file_path: writePath, content: writeContent })}>
                            {isLoading('write') ? <Loader2 className="w-3 h-3 animate-spin" /> : <FilePlus className="w-3 h-3" />}
                            Write File
                        </Button>
                    </div>

                    {/* Edit */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Edit3 className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Edit</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">File path</label>
                        <input type="text" value={editPath} onChange={e => setEditPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="/tmp/file.txt" />
                        <label className="text-[10px] text-muted-foreground">Find</label>
                        <input type="text" value={editOldText} onChange={e => setEditOldText(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} />
                        <label className="text-[10px] text-muted-foreground">Replace</label>
                        <input type="text" value={editNewText} onChange={e => setEditNewText(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('edit', 'Edit', { file_path: editPath, old_string: editOldText, new_string: editNewText })}>
                            {isLoading('edit') ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                            Edit File
                        </Button>
                    </div>

                    {/* Glob */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <FileSearch className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Glob</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">Pattern</label>
                        <input type="text" value={globPattern} onChange={e => setGlobPattern(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="**/*.py" />
                        <label className="text-[10px] text-muted-foreground">Search path</label>
                        <input type="text" value={globPath} onChange={e => setGlobPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="." />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('glob', 'Glob', { pattern: globPattern, path: globPath || undefined })}>
                            {isLoading('glob') ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSearch className="w-3 h-3" />}
                            Find Files
                        </Button>
                    </div>

                    {/* Grep */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Search className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Grep</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">Pattern (regex)</label>
                        <input type="text" value={grepPattern} onChange={e => setGrepPattern(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="def " />
                        <label className="text-[10px] text-muted-foreground">Path</label>
                        <input type="text" value={grepPath} onChange={e => setGrepPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="." />
                        <div className="flex gap-1.5">
                            <div className="flex-1 space-y-0.5">
                                <label className="text-[10px] text-muted-foreground">Include</label>
                                <input type="text" value={grepInclude} onChange={e => setGrepInclude(e.target.value)}
                                    className={inputCls} style={{ fontSize: '16px' }} placeholder="*.py" />
                            </div>
                            <div className="w-16 space-y-0.5">
                                <label className="text-[10px] text-muted-foreground">Max</label>
                                <input type="number" value={grepMaxResults} onChange={e => setGrepMaxResults(Number(e.target.value))}
                                    className={inputCls} style={{ fontSize: '16px' }} />
                            </div>
                        </div>
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('grep', 'Grep', {
                                pattern: grepPattern,
                                path: grepPath,
                                ...(grepInclude ? { include: grepInclude } : {}),
                                max_results: grepMaxResults,
                            })}>
                            {isLoading('grep') ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                            Search
                        </Button>
                    </div>

                    {/* Download */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Download className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Download</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">URL</label>
                        <input type="text" value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="https://example.com/file.pdf" />
                        <label className="text-[10px] text-muted-foreground">Save path</label>
                        <input type="text" value={downloadPath} onChange={e => setDownloadPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="/tmp/file.pdf" />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('download', 'DownloadFile', { url: downloadUrl, save_path: downloadPath })}>
                            {isLoading('download') ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            Download
                        </Button>
                    </div>

                    {/* Upload */}
                    <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Upload className="w-3 h-3 text-primary" />
                            <span className="text-xs font-semibold">Upload</span>
                        </div>
                        <label className="text-[10px] text-muted-foreground">Local file path</label>
                        <input type="text" value={uploadPath} onChange={e => setUploadPath(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="/tmp/file.txt" />
                        <label className="text-[10px] text-muted-foreground">Target URL</label>
                        <input type="text" value={uploadUrl} onChange={e => setUploadUrl(e.target.value)}
                            className={inputCls} style={{ fontSize: '16px' }} placeholder="https://example.com/upload" />
                        <Button size="sm" disabled={!!loading} className="w-full h-7 text-xs gap-1"
                            onClick={() => run('upload', 'UploadFile', { file_path: uploadPath, upload_url: uploadUrl })}>
                            {isLoading('upload') ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Upload
                        </Button>
                    </div>
                </div>

                {/* ── MIDDLE: result ── */}
                <div className="flex-1 flex flex-col overflow-hidden border-r">
                    <div className="px-3 py-1.5 border-b bg-muted/40 shrink-0 flex items-center gap-2">
                        <span className="text-xs font-semibold">
                            {activeSection ? `Result — ${activeSection}` : 'Result'}
                        </span>
                        {activeResult && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                activeResult.type === 'success'
                                    ? 'text-green-600 border-green-400'
                                    : 'text-red-500 border-red-400'
                            }`}>{activeResult.type}</span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {!!loading && (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {!loading && activeResult && (
                            <div className="p-3 space-y-3">
                                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
                                    {activeResult.output}
                                </pre>
                                {activeResult.image && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Image:</p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`data:${activeResult.image.media_type};base64,${activeResult.image.base64_data}`}
                                            alt="Tool result"
                                            className="max-w-full rounded border"
                                        />
                                    </div>
                                )}
                                {activeResult.metadata && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            Metadata
                                        </summary>
                                        <pre className="mt-1 p-2 bg-muted rounded font-mono text-[10px] overflow-auto">
                                            {JSON.stringify(activeResult.metadata, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                        {!loading && !activeResult && (
                            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                                Run a tool to see results
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: message log ── */}
                <div className="w-80 shrink-0 flex flex-col overflow-hidden">
                    <MessageLog logs={logs} onClear={clearLogs} className="flex-1 rounded-none border-0 border-none" maxHeight="max-h-full" />
                </div>
            </div>
        </div>
    );
}
