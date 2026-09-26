"use client";

// features/ai-work/conversations/components/ConversationArtifactsPanel.tsx
//
// ARTIFACTS — every file a coding session produced, mirrored into AI Matrx
// files by the desktop publisher. Rendered as a compact folder tree grouped
// by the artifact's path inside the session.
//
// Honesty rules: a session with no artifacts SAYS so; a failed read says so
// with a retry; nothing here renders a blank panel. Opening and downloading go
// through the app's file primitives (`openFilePreview`, `/files/f/<id>`,
// `Files.downloadFile`) — no storage URL is ever built here.
//
// SEVERAL TOOLS, EACH NAMED (XT-FIX-5 / FE2). A handed-off conversation has
// more than one claimed provider session, and artifact rows are keyed by ONE
// session id — so a panel over a single id presented one tool's files as the
// conversation's whole set while the originating tool's were unreachable
// (verifier V-XT-5 § A7). Every claimed tool now gets its own labelled section
// with its own tree, count and read outcome. One tool is still one section, and
// the tool is named there too: "whose files are these" is never implied.

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/lib/toast";
import { formatFileSize, formatRelativeTime } from "@/features/files/utils/format";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import * as Files from "@/features/files/api/files";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import {
  buildArtifactTree,
  isHtmlArtifact,
  type ArtifactFile,
  type ArtifactFolder,
} from "../artifacts/tree";
import type {
  CodingSessionArtifactGroup,
  CodingSessionArtifactsState,
} from "../artifacts/useCodingSessionArtifacts";
import { providerLabel } from "../presentation";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const NO_ARTIFACTS = "No artifacts captured for this session";

export function artifactCountLabel(count: number): string {
  return `${count} ${count === 1 ? "artifact" : "artifacts"}`;
}

/** Folder-collapse keys are namespaced per tool: two tools can hold the same
 *  relative path, and one key would collapse both. */
function folderKey(providerSessionId: string, path: string): string {
  return `${providerSessionId}\u0000${path}`;
}

/** The single-file page every other file list opens in a new tab. */
function fileTabHref(fileId: string): string {
  return `/files/f/${encodeURIComponent(fileId)}`;
}

export function ConversationArtifactsPanel({
  artifacts,
  hasSession,
}: {
  artifacts: CodingSessionArtifactsState;
  /** False while no claimed provider session is known for this conversation. */
  hasSession: boolean;
}) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const folderKeys = artifacts.groups.flatMap((group) =>
    collectFolderPaths(buildArtifactTree(group.rows)).map((path) =>
      folderKey(group.providerSessionId, path),
    ),
  );
  const severalTools = artifacts.groups.length > 1;

  const toggleFolder = (key: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Artifacts</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Files this conversation&apos;s coding sessions wrote, captured by
            Matrx Local and stored in your AI Matrx files.
            {artifacts.state === "ready" && artifacts.rows.length > 0
              ? severalTools
                ? ` ${artifactCountLabel(artifacts.rows.length)} across ${artifacts.groups.length} tools, listed per tool below.`
                : ` ${artifactCountLabel(artifacts.rows.length)}.`
              : null}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {artifacts.state === "ready" && folderKeys.length > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                setCollapsedFolders(
                  collapsedFolders.size === folderKeys.length
                    ? new Set()
                    : new Set(folderKeys),
                )
              }
            >
              {collapsedFolders.size === folderKeys.length
                ? "Expand all"
                : "Collapse all"}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={artifacts.reload}
            disabled={!hasSession || artifacts.state === "loading"}
            aria-label="Re-read artifacts"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!hasSession ? (
        <p className="text-xs text-muted-foreground">
          No provider session is bound to this conversation, so there is
          nothing to look up. A handoff that nobody has claimed yet has no
          session of its own and produces no artifacts.
        </p>
      ) : artifacts.state === "idle" || artifacts.state === "loading" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading artifacts…
        </div>
      ) : artifacts.state === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{artifacts.error ?? "Artifact read failed."}</p>
            <button
              type="button"
              onClick={artifacts.reload}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
          <ErrorAlchemyMenu error={artifacts.error} />
        </div>
      ) : (
        <div className="space-y-2">
          {/* A partial failure is stated where it happened AND here, so the
              tools that did answer are never mistaken for the whole set. */}
          {artifacts.error ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {artifacts.error} What you see below is not the whole set.
              <ErrorAlchemyMenu error={artifacts.error} />
            </p>
          ) : null}
          {artifacts.groups.map((group) => (
            <ToolArtifacts
              key={group.providerSessionId}
              group={group}
              nameTheTool={severalTools}
              collapsed={collapsedFolders}
              onToggle={toggleFolder}
              onRetry={artifacts.reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ONE tool's artifacts. Its own heading, its own count, its own read outcome —
 * so no file on this screen is anonymous about which tool wrote it.
 */
function ToolArtifacts({
  group,
  nameTheTool,
  collapsed,
  onToggle,
  onRetry,
}: {
  group: CodingSessionArtifactGroup;
  /** True when the conversation has more than one tool; a lone tool is still
   *  named in the section line, just without competing for attention. */
  nameTheTool: boolean;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onRetry: () => void;
}) {
  const tree = buildArtifactTree(group.rows);
  const label = providerLabel(group.provider) ?? group.provider;
  return (
    <section className={cn(nameTheTool && "rounded-lg border border-border p-2")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-1">
        <h3 className="text-xs font-semibold text-foreground">
          {nameTheTool ? label : `From the ${label} session`}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {group.state === "ready"
            ? artifactCountLabel(group.rows.length)
            : group.state === "error"
              ? "read failed"
              : "reading…"}
        </span>
      </div>
      {group.state === "loading" ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading {label} artifacts…
        </div>
      ) : group.state === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>
              {group.error ?? "Artifact read failed."} {label}&apos;s files are
              not shown.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
          <ErrorAlchemyMenu error={group.error} />
        </div>
      ) : group.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {NO_ARTIFACTS}.
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-background scrollbar-thin">
          <ul className="py-1 text-xs">
            <FolderChildren
              folder={tree}
              depth={0}
              collapsed={collapsed}
              onToggle={onToggle}
              sessionId={group.providerSessionId}
            />
          </ul>
        </div>
      )}
    </section>
  );
}

function collectFolderPaths(folder: ArtifactFolder, into: string[] = []) {
  for (const child of folder.folders) {
    into.push(child.path);
    collectFolderPaths(child, into);
  }
  return into;
}

function FolderChildren({
  folder,
  depth,
  collapsed,
  onToggle,
  sessionId,
}: {
  folder: ArtifactFolder;
  depth: number;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  sessionId: string;
}) {
  return (
    <>
      {folder.folders.map((child) => (
        <FolderRow
          key={child.path}
          folder={child}
          depth={depth}
          collapsed={collapsed}
          onToggle={onToggle}
          sessionId={sessionId}
        />
      ))}
      {folder.files.map((file) => (
        <FileRow key={file.id} file={file} depth={depth} />
      ))}
    </>
  );
}

function FolderRow({
  folder,
  depth,
  collapsed,
  onToggle,
  sessionId,
}: {
  folder: ArtifactFolder;
  depth: number;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  sessionId: string;
}) {
  const key = folderKey(sessionId, folder.path);
  const open = !collapsed.has(key);
  return (
    <li>
      <Collapsible open={open} onOpenChange={() => onToggle(key)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-full items-center gap-1.5 px-2 text-left hover:bg-accent"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {folder.name}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {folder.totalFiles}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <ul>
            <FolderChildren
              folder={folder}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              sessionId={sessionId}
            />
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function FileRow({ file, depth }: { file: ArtifactFile; depth: number }) {
  const saveBlob = useDownloadBlob();
  const [downloading, setDownloading] = useState(false);
  const html = isHtmlArtifact(file);

  const open = () => {
    // HTML renders as a page: open the single-file page in a new tab, the
    // same door every other file list uses. Everything else opens the
    // canonical preview window in place.
    if (html) {
      window.open(fileTabHref(file.id), "_blank", "noopener,noreferrer");
      return;
    }
    openFilePreview(file.id);
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await Files.downloadFile(file.id);
      saveBlob({ blob, filename: filename ?? file.name });
    } catch (err) {
      toast.error("Download failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li
      className="group flex h-7 items-center gap-1.5 pr-1 hover:bg-accent"
      style={{ paddingLeft: `${8 + depth * 14 + 18}px` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={open}
        title={
          html
            ? `Open ${file.relativePath} in a new tab`
            : `Preview ${file.relativePath}`
        }
        className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
      >
        {file.name}
      </button>
      <span className="hidden w-16 shrink-0 text-right tabular-nums text-muted-foreground sm:inline">
        {file.sizeBytes === null ? "—" : formatFileSize(file.sizeBytes)}
      </span>
      <time
        dateTime={file.updatedAt}
        title={new Date(file.updatedAt).toLocaleString()}
        className="hidden w-20 shrink-0 truncate text-right text-muted-foreground md:inline"
      >
        {formatRelativeTime(file.updatedAt)}
      </time>
      <span className="flex shrink-0 items-center gap-0.5">
        <a
          href={fileTabHref(file.id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${file.name} in a new tab`}
          title="Open in new tab"
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground",
            "opacity-60 group-hover:opacity-100",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={`Download ${file.name}`}
          title="Download"
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50",
            "opacity-60 group-hover:opacity-100",
          )}
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </button>
      </span>
    </li>
  );
}
