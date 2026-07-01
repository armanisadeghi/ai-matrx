/**
 * features/files/components/core/FilePreview/previewers/CodePreview.tsx
 *
 * Syntax-highlighted source code preview. Restored from the legacy
 * `components/ui/file-preview/previews/CodePreview.tsx`, ported to use
 * react-syntax-highlighter (Prism) + the file extension → language map
 * inferred from `icon-map.ts`. Keeps the same fetch + alert-card error
 * pattern as the other previewers so failures are honest and recoverable.
 *
 * Bundle: this file is dynamically imported by FilePreview, so callers
 * who never open a code file don't pay for the highlighter (~150KB).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Copy, Check } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { extname } from "../../../../utils/path";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import { useThemeMode } from "@/styles/themes/useThemeMode";

export interface CodePreviewProps {
  fileId: string;
  fileName: string;
  /** Cap fetched bytes — 1MB is plenty for any sane code file. */
  maxBytes?: number;
  className?: string;
}

/**
 * Map our extensions → react-syntax-highlighter / Prism language ids.
 * The library accepts unknown ids gracefully (no highlight), but we map
 * everything we see in icon-map for proper coloring.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  // JS / TS
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  // Other languages
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  scala: "scala",
  // Web
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  css: "css",
  scss: "scss",
  less: "less",
  // Config / data
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  // SQL
  sql: "sql",
  // Other
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  dockerfile: "docker",
  makefile: "makefile",
  lua: "lua",
  r: "r",
};

function detectLanguage(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext) return EXT_TO_LANGUAGE[ext] ?? "text";
  // Filenames without extensions — common cases.
  const lower = fileName.toLowerCase();
  if (lower === "dockerfile") return "docker";
  if (lower === "makefile") return "makefile";
  return "text";
}

export function CodePreview({
  fileId,
  fileName,
  maxBytes = 1024 * 1024,
  className,
}: CodePreviewProps) {
  const isDark = useThemeMode() === "dark";
  // Pulls bytes via the Python `/files/{id}/download` endpoint and gives
  // us a `blob:` URL — same-origin, JWT-authenticated, CORS-safe. The
  // S3-signed URL would 403 here because S3 bucket CORS doesn't allow
  // `fetch()` from the browser.
  const { blob, loading: blobLoading, error: blobError } = useFileBlob(fileId);

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);

  const language = useMemo(() => detectLanguage(fileName), [fileName]);

  useEffect(() => {
    if (!blob) return undefined;
    let cancelled = false;
    setError(null);
    setText(null);
    setTruncated(false);
    (async () => {
      try {
        if (blob.size > maxBytes) {
          if (cancelled) return;
          setTruncated(true);
          setText(await blob.slice(0, maxBytes).text());
        } else {
          setText(await blob.text());
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, maxBytes]);

  const combinedError = error ?? blobError;

  const onCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable in non-secure context */
    }
  };

  if (combinedError) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
          className,
        )}
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Couldn&apos;t load this file</h3>
          <p className="max-w-md text-xs text-muted-foreground break-words">
            {combinedError}
          </p>
        </div>
      </div>
    );
  }

  if (blobLoading || text == null) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/20",
          className,
        )}
      >
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span className="font-mono uppercase tracking-wide">{language}</span>
          {truncated ? (
            <span className="text-warning">
              · truncated to first {(maxBytes / 1024 / 1024).toFixed(0)}MB
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <SyntaxHighlighter
          language={language}
          style={isDark ? vscDarkPlus : vs}
          showLineNumbers
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            background: "transparent",
            fontSize: "0.75rem",
            lineHeight: "1.25rem",
            padding: "0.75rem",
          }}
          codeTagProps={{
            style: { fontFamily: "var(--font-mono, monospace)" },
          }}
        >
          {text}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export default CodePreview;
