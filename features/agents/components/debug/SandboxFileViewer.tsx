"use client";

/**
 * SandboxFileViewer — read and show one file from a sandbox by absolute path.
 *
 * The reusable foundation for "the model wrote a file, let me see it": give it
 * the bound box row id + an absolute path (e.g.
 * /home/agent/repos/matrx-sandbox/SANDBOX_AGENT_ISSUES.md) and it fetches the
 * contents via SandboxFilesystemAdapter.readFile (→ /api/sandbox/{id}/fs/read).
 *
 * Standalone — no provider, no Redux. The eventual markdown-link click handler
 * will render this with the resolved box id + the path it parsed out of the
 * assistant message. The path input here makes it usable/testable on its own.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { SandboxFilesystemAdapter } from "@/features/code/adapters/SandboxFilesystemAdapter";

interface SandboxFileViewerProps {
  /** sandbox_instances.id (the row UUID). */
  sandboxRowId: string;
  /** Absolute path inside the box. When omitted, the user types one. */
  initialPath?: string;
  /** Hide the path input (e.g. when opened from a fixed model-referenced path). */
  lockPath?: boolean;
}

export function SandboxFileViewer({
  sandboxRowId,
  initialPath = "",
  lockPath = false,
}: SandboxFileViewerProps) {
  const [path, setPath] = useState(initialPath);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Recreate the adapter only when the box changes.
  const adapterRef = useRef<SandboxFilesystemAdapter | null>(null);
  if (!adapterRef.current || adapterRef.current.instanceId !== sandboxRowId) {
    adapterRef.current = new SandboxFilesystemAdapter(sandboxRowId);
  }

  const load = useCallback(
    async (p: string) => {
      const target = p.trim();
      if (!target) return;
      setLoading(true);
      setError(null);
      try {
        const adapter = adapterRef.current;
        if (!adapter) throw new Error("Sandbox adapter not initialized");
        const text = await adapter.readFile(target);
        setContent(text);
      } catch (err) {
        setContent(null);
        setError(err instanceof Error ? err.message : "Failed to read file");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-load when an initial path is provided (the model-link case).
  useEffect(() => {
    if (initialPath) void load(initialPath);
  }, [initialPath, sandboxRowId, load]);

  const handleCopy = async () => {
    if (content == null) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("File contents copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!lockPath && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(path);
          }}
          className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/agent/repos/…/file.md"
            spellCheck={false}
            className="flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !path.trim()}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-accent/60 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Open
          </button>
        </form>
      )}

      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30">
        <span className="font-mono text-[11px] text-muted-foreground truncate">
          {lockPath ? initialPath : content != null ? path : ""}
        </span>
        {content != null && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            Copy
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {loading && content == null ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading {path}…
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive break-words">
            {error}
          </div>
        ) : content != null ? (
          <pre className="p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
            {content}
          </pre>
        ) : (
          <div className="p-3 text-xs text-muted-foreground">
            Enter an absolute path and Open to read the file.
          </div>
        )}
      </div>
    </div>
  );
}
