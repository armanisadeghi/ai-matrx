"use client";

// features/transcripts/components/TranscriptsListPage.tsx
//
// Mirrors the /agents/all pattern: title + actions portaled into the
// shell header via <PageHeader>; body is a max-w-[1800px] container
// with a pill-style search bar above a 4-column card grid. Each card
// is a compact summary with three quick-launch buttons (Processor /
// Studio / Cleanup). Search + sort are client-side over the
// server-fetched summary array.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FileAudio,
  FileVideo,
  Headphones,
  Mic,
  Eraser,
  Columns2 as StudioIcon,
  Eye,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { cn } from "@/lib/utils";

export interface TranscriptListRow {
  id: string;
  title: string;
  description: string;
  sourceType: string;
  folderName: string;
  tags: string[];
  durationSeconds: number | null;
  wordCount: number | null;
  segmentCount: number | null;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
}

interface TranscriptsListPageProps {
  rows: TranscriptListRow[];
}

type SortKey = "updated" | "created" | "title" | "duration" | "words";

const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  audio: FileAudio,
  video: FileVideo,
  meeting: Headphones,
  interview: Mic,
  other: FileAudio,
};

const SOURCE_LABEL: Record<string, string> = {
  audio: "Audio",
  video: "Video",
  meeting: "Meeting",
  interview: "Interview",
  other: "Other",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Title + count + Sort + New — portaled into the shell header strip
// via <PageHeader>. Mirrors `AgentsListHeader`.
function TranscriptsHeader({
  count,
  total,
  sortKey,
  setSortKey,
}: {
  count: number;
  total: number;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
}) {
  return (
    <div className="flex items-center justify-between w-full gap-2 px-1">
      <div className="flex items-center gap-2 shrink-0">
        <Mic className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Transcripts
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count === total ? `${total}` : `${count} / ${total}`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-8 text-xs rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Sort transcripts"
        >
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="title">Title (A→Z)</option>
          <option value="duration">Longest first</option>
          <option value="words">Most words</option>
        </select>
        <Button asChild size="sm" className="h-8 gap-1.5">
          <Link href="/transcripts/new" aria-label="Create new transcript">
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs font-medium hidden sm:inline">New</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function TranscriptsListPage({ rows }: TranscriptsListPageProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((r) => {
        if (r.title.toLowerCase().includes(q)) return true;
        if (r.description.toLowerCase().includes(q)) return true;
        if (r.folderName.toLowerCase().includes(q)) return true;
        if (r.tags.some((t) => t.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    list = [...list];
    switch (sortKey) {
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "created":
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        break;
      case "duration":
        list.sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0));
        break;
      case "words":
        list.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
        break;
      case "updated":
      default:
        list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    }
    return list;
  }, [rows, query, sortKey]);

  return (
    <>
      {/* Portal title + sort + New into the shell header strip. */}
      <PageHeader>
        <TranscriptsHeader
          count={filtered.length}
          total={rows.length}
          sortKey={sortKey}
          setSortKey={setSortKey}
        />
      </PageHeader>

      {/* Body — mirrors AgentsGrid container shape exactly. */}
      <div className="w-full">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          {/* Search pill — matches AgentsGrid styling. */}
          <div className="mb-4 flex items-center gap-3 p-1 rounded-full matrx-glass-thin-border hover:shadow-xl transition-shadow">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcripts by title, description, folder, tag…"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground py-1.5"
              aria-label="Search transcripts"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0 mr-1"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasQuery={query.length > 0} hasAny={rows.length > 0} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-3">
              {filtered.map((row) => (
                <TranscriptCard key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TranscriptCard({ row }: { row: TranscriptListRow }) {
  const SourceIcon = SOURCE_ICON[row.sourceType] ?? FileAudio;
  const openHref = `/transcripts/processor?focus=${encodeURIComponent(row.id)}`;
  const studioHref = `/transcripts/studio?import=${encodeURIComponent(row.id)}`;
  const cleanupHref = `/transcripts/cleanup?import=${encodeURIComponent(row.id)}`;

  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card overflow-hidden",
        "transition-colors hover:border-primary/40 hover:shadow-md",
        "flex flex-col",
      )}
    >
      {/* Body — clickable to open. */}
      <Link
        href={openHref}
        className="flex-1 p-3.5 flex flex-col gap-1.5 min-w-0"
      >
        <div className="flex items-start gap-2 min-w-0">
          <SourceIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug flex-1 min-w-0">
            {row.title}
          </h3>
          {row.isDraft && (
            <span
              className={cn(
                "shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0 rounded leading-4",
                "ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              draft
            </span>
          )}
        </div>
        {row.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
            {row.description}
          </p>
        )}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums mt-auto pt-1">
          <span title="Source type">
            {SOURCE_LABEL[row.sourceType] ?? "Other"}
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span title="Duration">{formatDuration(row.durationSeconds)}</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span title="Word count">{formatNumber(row.wordCount)} words</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span title={row.updatedAt}>{formatRelative(row.updatedAt)}</span>
        </div>
        {row.folderName && row.folderName !== "Transcripts" && (
          <div className="text-[11px] text-muted-foreground/80 truncate">
            in {row.folderName}
          </div>
        )}
      </Link>

      {/* Action bar — three UI shortcuts. Matches the agent-card footer
          pattern (border-top, low-chrome icon buttons). */}
      <div className="border-t border-border bg-muted/20 px-2 py-1 flex items-center gap-1">
        <CardAction
          href={openHref}
          label="Open in Processor"
          icon={Eye}
          text="Open"
        />
        <CardAction
          href={studioHref}
          label="Open in Studio"
          icon={StudioIcon}
          text="Studio"
        />
        <CardAction
          href={cleanupHref}
          label="Run Cleanup"
          icon={Eraser}
          text="Cleanup"
        />
      </div>
    </div>
  );
}

function CardAction({
  href,
  label,
  icon: Icon,
  text,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        "flex-1 inline-flex items-center justify-center gap-1 h-7 rounded text-[11px] font-medium",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "transition-colors",
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </Link>
  );
}

function EmptyState({
  hasQuery,
  hasAny,
}: {
  hasQuery: boolean;
  hasAny: boolean;
}) {
  if (hasQuery) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
        <Search className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm">No transcripts match your search.</p>
      </div>
    );
  }
  if (!hasAny) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <FileAudio className="h-10 w-10 mb-3 text-muted-foreground opacity-50" />
        <h2 className="text-base font-semibold mb-1">No transcripts yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          Record audio, upload a file, or paste an AI-generated transcript to
          get started.
        </p>
        <Button asChild>
          <Link href="/transcripts/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New transcript
          </Link>
        </Button>
      </div>
    );
  }
  return null;
}
