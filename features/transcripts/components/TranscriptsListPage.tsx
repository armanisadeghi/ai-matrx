"use client";

// features/transcripts/components/TranscriptsListPage.tsx
//
// The list-savior page for /transcripts. Replaces the forced "trapped in
// the processor" entry with an /agents-style list view: every transcript
// the user owns, with per-row UI pickers (Processor / Studio / Cleanup /
// Open / Delete). Lightweight client state for search + sort. Server
// already filtered + ordered; this only handles in-memory refinement.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FileAudio,
  FileVideo,
  Headphones,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Columns2 as StudioIcon,
  Eraser,
  Eye,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    // copy before sort (sort is in-place)
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
    <div className="h-[calc(100dvh-var(--header-height,2.5rem))] w-full flex flex-col bg-background">
      {/* Toolbar — title pulled by app shell; this is the secondary action bar. */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 py-2 flex items-center gap-2 flex-wrap">
        <h1 className="text-base font-semibold tracking-tight mr-2">
          Transcripts
        </h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length === rows.length
            ? `${rows.length}`
            : `${filtered.length} / ${rows.length}`}
        </span>

        <div className="relative flex-1 max-w-md min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, folder, tag…"
            className="w-full pl-7 pr-7 py-1.5 text-sm rounded-md border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Search transcripts"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-sm rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Sort transcripts"
        >
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="title">Title (A→Z)</option>
          <option value="duration">Longest first</option>
          <option value="words">Most words</option>
        </select>

        <div className="flex-1" />

        <Button asChild size="sm" className="h-8 gap-1.5">
          <Link href="/transcripts/new">
            <Plus className="h-3.5 w-3.5" />
            New
          </Link>
        </Button>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <EmptyState hasQuery={query.length > 0} hasAny={rows.length > 0} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-border">
            {filtered.map((row) => (
              <TranscriptRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TranscriptRow({ row }: { row: TranscriptListRow }) {
  const SourceIcon = SOURCE_ICON[row.sourceType] ?? FileAudio;
  // Default action: open in the processor (the existing workspace
  // people are used to). The processor's own sidebar takes them
  // anywhere from there; the row's secondary action buttons are
  // shortcuts to the alternate UIs.
  const openHref = `/transcripts/processor?focus=${encodeURIComponent(row.id)}`;
  const studioHref = `/transcripts/studio?import=${encodeURIComponent(row.id)}`;
  const cleanupHref = `/transcripts/cleanup?import=${encodeURIComponent(row.id)}`;

  return (
    <li className="group hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2 min-w-0">
        <SourceIcon className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Title + meta — main column */}
        <Link
          href={openHref}
          className="flex-1 min-w-0 flex items-baseline gap-2"
        >
          <span className="text-sm font-medium text-foreground truncate hover:underline">
            {row.title}
          </span>
          {row.isDraft && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              draft
            </span>
          )}
          {row.folderName && row.folderName !== "Transcripts" && (
            <span className="text-xs text-muted-foreground truncate">
              · {row.folderName}
            </span>
          )}
          {row.description && (
            <span className="hidden md:inline text-xs text-muted-foreground/80 truncate">
              · {row.description}
            </span>
          )}
        </Link>

        {/* Stats — hidden on mobile, tabular on desktop */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
          <span className="w-12 text-right" title="Duration">
            {formatDuration(row.durationSeconds)}
          </span>
          <span className="w-12 text-right" title="Words">
            {formatNumber(row.wordCount)} w
          </span>
          <span className="w-16 text-right" title={row.updatedAt}>
            {formatRelative(row.updatedAt)}
          </span>
        </div>

        {/* Action chips — visible on hover (desktop) / always (mobile) */}
        <div className="flex items-center gap-1 shrink-0">
          <RowAction href={openHref} label="Open in processor" icon={Eye} />
          <RowAction href={studioHref} label="Open in studio" icon={StudioIcon} />
          <RowAction href={cleanupHref} label="Run cleanup" icon={Eraser} />
        </div>
      </div>
    </li>
  );
}

function RowAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-md",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "transition-colors",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
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
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 text-muted-foreground">
        <Search className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm">No transcripts match your search.</p>
      </div>
    );
  }
  if (!hasAny) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
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
