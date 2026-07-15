"use client";

/**
 * FsInline — the clean, human renderer for the sandbox/local filesystem tools
 * (`fs_list`, `fs_read`). Filesystem results are "known pretty data": a
 * directory listing or a file body — so they get the official card treatment
 * (the ArtifactResultBar visual grammar), NEVER the generic key/value table
 * that dumped `is_dir true/false` badges, raw epoch mtimes, and 4096-byte
 * directory sizes into the chat (the owner-flagged "Fs List OUCH").
 *
 * The card (concept-approved 2026-07-14):
 *   • ONE rounded card. Header: tinted icon + the path's basename + a quiet
 *     "N folders · M files" (or file-size) sub-line.
 *   • Listing rows: folder/file icon + name + human-readable size for files.
 *     NO table headers, NO sort arrows, NO true/false chips, NO epoch times —
 *     the full raw payload stays available in the Tool Admin / Raw tabs.
 *   • Rows cap at 8 with "Show N more" expanding in place.
 *   • `fs_read`: the file content as a fenced code block (language from the
 *     extension), header shows name + size + "truncated" when applicable.
 *
 * Shapes are read DEFENSIVELY (the payload comes from agent-side tools):
 * unknown shapes fall through to <GenericRenderer> — never a wrong guess.
 */

import React from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";

// ─── payload shapes ──────────────────────────────────────────────────────────

interface FsEntry {
    name: string;
    isDir: boolean;
    size: number | null;
}

/** Narrow one raw listing entry; null when it isn't one. */
function asFsEntry(raw: unknown): FsEntry | null {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const name =
        typeof o.name === "string" && o.name
            ? o.name
            : typeof o.path === "string" && o.path
              ? (o.path.split("/").pop() ?? o.path)
              : null;
    if (!name) return null;
    const isDir = o.is_dir === true || o.isDir === true || o.type === "directory";
    const size = typeof o.size === "number" ? o.size : null;
    return { name, isDir, size };
}

/** "12.4 KB" — human size; directories and unknowns render nothing. */
function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Basename of a path, or the path itself when it has no slash / is a root. */
function basename(path: string): string {
    const clean = path.replace(/\/+$/, "");
    const last = clean.split("/").pop();
    return last && last.length > 0 ? last : clean || "/";
}

/** Fence language from a filename extension (best effort; empty is fine). */
function fenceLang(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
        ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", py: "python", sh: "bash",
        bash: "bash", json: "json", md: "markdown", sql: "sql", css: "css",
        html: "html", yml: "yaml", yaml: "yaml", toml: "toml", rs: "rust", go: "go",
    };
    return map[ext] ?? "";
}

// ─── the card frame (ArtifactResultBar grammar) ──────────────────────────────

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full overflow-hidden rounded-xl border border-border/50 bg-card">
        {children}
    </div>
);

const CardHeader: React.FC<{
    icon: React.ReactNode;
    title: string;
    sub: string;
}> = ({ icon, title, sub }) => (
    <div className="flex items-center gap-3 px-4 py-2.5">
        {icon}
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
    </div>
);

// ─── listing body ────────────────────────────────────────────────────────────

const ROW_CAP = 8;

const FsListCard: React.FC<{ path: string; entries: FsEntry[] }> = ({ path, entries }) => {
    const [showAll, setShowAll] = React.useState(false);
    const dirs = entries.filter((e) => e.isDir).length;
    const files = entries.length - dirs;
    const sub = [
        dirs > 0 ? `${dirs} ${dirs === 1 ? "folder" : "folders"}` : null,
        files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : null,
    ]
        .filter(Boolean)
        .join(" · ") || "Empty folder";

    const shown = showAll ? entries : entries.slice(0, ROW_CAP);
    const remaining = entries.length - shown.length;

    return (
        <Card>
            <CardHeader
                icon={
                    <FolderOpen
                        className="size-[18px] shrink-0 text-sky-600 dark:text-sky-400"
                        strokeWidth={2.25}
                    />
                }
                title={basename(path)}
                sub={`${path} · ${sub}`}
            />
            {entries.length > 0 && (
                <div className="border-t border-border/50">
                    {shown.map((e, i) => (
                        <div
                            key={`${e.name}-${i}`}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-1.5",
                                i > 0 && "border-t border-border/30",
                            )}
                        >
                            {e.isDir ? (
                                <Folder className="size-3.5 shrink-0 text-sky-600/70 dark:text-sky-400/70" />
                            ) : (
                                <File className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                                {e.name}
                            </span>
                            {!e.isDir && e.size !== null && (
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {humanSize(e.size)}
                                </span>
                            )}
                        </div>
                    ))}
                    {remaining > 0 && (
                        <button
                            type="button"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                setShowAll(true);
                            }}
                            className="flex w-full items-center gap-1.5 border-t border-border/30 px-4 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                            Show {remaining} more
                        </button>
                    )}
                </div>
            )}
        </Card>
    );
};

// ─── read body ───────────────────────────────────────────────────────────────

const FsReadCard: React.FC<{ path: string; content: string; size: number | null; truncated: boolean }> = ({
    path,
    content,
    size,
    truncated,
}) => (
    <Card>
        <CardHeader
            icon={<File className="size-[18px] shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2.25} />}
            title={basename(path)}
            sub={[path, size !== null ? humanSize(size) : null, truncated ? "truncated" : null]
                .filter(Boolean)
                .join(" · ")}
        />
        <div className="max-h-80 overflow-auto border-t border-border/50 px-4 py-2 [&_pre]:!my-0">
            <BasicMarkdownContent
                content={"```" + fenceLang(path) + "\n" + content + "\n```"}
                showCopyButton={false}
            />
        </div>
    </Card>
);

// ─── consolidated batch card ─────────────────────────────────────────────────

interface FsListing {
    path: string;
    entries: FsEntry[];
}

/** Narrow a completed fs_list entry into a listing; null when it isn't one. */
export function asFsListing(entry: ToolLifecycleEntry): FsListing | null {
    if (entry.toolName !== "fs_list" || entry.status !== "completed") return null;
    const result = resultAsObject(entry);
    if (!result || !Array.isArray(result.entries)) return null;
    const args = (entry.arguments ?? {}) as Record<string, unknown>;
    const path =
        (typeof result.path === "string" && result.path) ||
        (typeof args.path === "string" && args.path) ||
        "";
    return {
        path,
        entries: (result.entries as unknown[])
            .map(asFsEntry)
            .filter((e): e is FsEntry => e !== null),
    };
}

/** "3 folders · 2 files" / "Empty". */
function countsLabel(entries: FsEntry[]): string {
    const dirs = entries.filter((e) => e.isDir).length;
    const files = entries.length - dirs;
    const parts = [
        dirs > 0 ? `${dirs} ${dirs === 1 ? "folder" : "folders"}` : null,
        files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Empty";
}

/**
 * FsBatchCard — a run of consecutive `fs_list` calls consolidated into ONE
 * card (the owner's template: one header, one row per listing, no batch line,
 * no per-call cards, no left rail, no nesting). Each row click-expands its
 * entries as flat sub-rows inside the SAME card.
 */
export const FsBatchCard: React.FC<{
    listings: FsListing[];
    className?: string;
}> = ({ listings, className }) => {
    const [open, setOpen] = React.useState<Record<number, boolean>>({});

    return (
        <div className={cn("mb-2", className)}>
            <Card>
                <CardHeader
                    icon={
                        <FolderOpen
                            className="size-[18px] shrink-0 text-sky-600 dark:text-sky-400"
                            strokeWidth={2.25}
                        />
                    }
                    title={`Listed ${listings.length} ${listings.length === 1 ? "folder" : "folders"}`}
                    sub={listings.map((l) => basename(l.path)).join(" · ")}
                />
                <div className="border-t border-border/50">
                    {listings.map((l, i) => (
                        <React.Fragment key={`${l.path}-${i}`}>
                            <button
                                type="button"
                                onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                                className={cn(
                                    "flex w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-accent/30",
                                    i > 0 && "border-t border-border/30",
                                )}
                            >
                                <Folder className="size-3.5 shrink-0 text-sky-600/70 dark:text-sky-400/70" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                                    {basename(l.path)}
                                    <span className="ml-2 text-xs text-muted-foreground">{l.path}</span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {countsLabel(l.entries)}
                                </span>
                                <ChevronRight
                                    className={cn(
                                        "size-3 shrink-0 text-muted-foreground transition-transform",
                                        open[i] && "rotate-90",
                                    )}
                                />
                            </button>
                            {open[i] &&
                                l.entries.map((e, j) => (
                                    <div
                                        key={`${e.name}-${j}`}
                                        className="flex items-center gap-2.5 border-t border-border/20 py-1.5 pl-10 pr-4"
                                    >
                                        {e.isDir ? (
                                            <Folder className="size-3.5 shrink-0 text-sky-600/70 dark:text-sky-400/70" />
                                        ) : (
                                            <File className="size-3.5 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                                            {e.name}
                                        </span>
                                        {!e.isDir && e.size !== null && (
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                {humanSize(e.size)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                        </React.Fragment>
                    ))}
                </div>
            </Card>
        </div>
    );
};

// ─── dispatcher ──────────────────────────────────────────────────────────────

export const FsInline: React.FC<ToolRendererProps> = (props) => {
    const { entry, onOpenOverlay, toolGroupId } = props;

    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }
    // Not terminal — the shell line shimmers with the intent; nothing to show yet.
    if (!isTerminal(entry)) return null;

    const result = resultAsObject(entry);
    const path =
        (typeof result?.path === "string" && result.path) ||
        getArg<string>(entry, "path") ||
        "";

    // Listing shape: { path, entries: [...] }.
    if (result && Array.isArray(result.entries)) {
        const entries = (result.entries as unknown[])
            .map(asFsEntry)
            .filter((e): e is FsEntry => e !== null);
        if (entries.length > 0 || (result.entries as unknown[]).length === 0) {
            return <FsListCard path={path} entries={entries} />;
        }
    }

    // Read shape: { path, content }.
    if (result && typeof result.content === "string") {
        return (
            <FsReadCard
                path={path}
                content={result.content}
                size={typeof result.size === "number" ? result.size : null}
                truncated={result.truncated === true}
            />
        );
    }

    // Unknown shape — an honest generic fallback, never a wrong guess.
    return <GenericRenderer {...props} />;
};

export default FsInline;
