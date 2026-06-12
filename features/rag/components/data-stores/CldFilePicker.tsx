"use client";

/**
 * CldFilePicker — pick existing cld_files to bind to a data store.
 *
 * Reads the user's already-loaded file list from Redux (no extra fetch)
 * and renders a searchable, mime-filtered list with multi-select.
 * Selected ids come back as `(cld_file_id, file_name)` tuples so the
 * caller can show what was added.
 *
 * Used as the in-dialog body of "+ Bind document" on the data-stores
 * page so users don't have to paste UUIDs.
 */

import { useMemo, useState } from "react";
import { File as FileIcon, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesArray } from "@/features/files/redux/selectors";
import type { CloudFileRecord } from "@/features/files";

export interface CldFilePickerProps {
  /** When provided, only files whose mime_type starts with one of these is shown. */
  mimePrefixes?: string[];
  /** Already-bound ids — disabled in the list, "Already bound" badge. */
  excludeIds?: Set<string>;
  /** Confirm callback: parent receives the selected files + names. */
  onConfirm: (
    picks: { cldFileId: string; fileName: string }[],
  ) => void | Promise<void>;
  onCancel: () => void;
  /** Default = "Add N selected". */
  confirmLabel?: string;
}

export function CldFilePicker({
  mimePrefixes,
  excludeIds,
  onConfirm,
  onCancel,
  confirmLabel,
}: CldFilePickerProps) {
  const allFiles = useAppSelector(selectAllFilesArray);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  // Filter: not-deleted + matches mime prefix + matches search query.
  // Sort by recency (updatedAt desc) so the most recent uploads land first.
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allFiles
      .filter((f) => {
        if (f.deletedAt) return false;
        if (mimePrefixes && mimePrefixes.length) {
          const mt = (f.mimeType ?? "").toLowerCase();
          if (!mimePrefixes.some((p) => mt.startsWith(p.toLowerCase()))) {
            return false;
          }
        }
        if (!q) return true;
        return (
          f.fileName.toLowerCase().includes(q) ||
          f.filePath.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
      );
  }, [allFiles, query, mimePrefixes]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setPending(true);
    const picks: { cldFileId: string; fileName: string }[] = [];
    for (const id of selected) {
      const f = allFiles.find((x) => x.id === id);
      if (f) picks.push({ cldFileId: f.id, fileName: f.fileName });
    }
    try {
      await onConfirm(picks);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[60dvh]">
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or path…"
            className="pl-8 h-8 text-xs"
            autoFocus
          />
        </div>
        {mimePrefixes && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            Filtered to {mimePrefixes.join(", ")}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {visibleFiles.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No matching files. Try a different search or upload via the
            files page first.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {visibleFiles.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                selected={selected.has(f.id)}
                disabled={excludeIds?.has(f.id) ?? false}
                onToggle={() => toggle(f.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="px-3 py-2 border-t flex items-center justify-between">
        <div className="text-xs text-muted-foreground tabular-nums">
          {selected.size} of {visibleFiles.length} selected
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={selected.size === 0 || pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              confirmLabel ?? `Add ${selected.size}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileRow({
  file,
  selected,
  disabled,
  onToggle,
}: {
  file: CloudFileRecord;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed",
          selected && "bg-primary/10",
        )}
      >
        <div
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
        >
          {selected ? (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.5l2 2 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
        <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate">{file.fileName}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {file.filePath} · {file.mimeType ?? "—"}
            {file.fileSize !== null
              ? ` · ${(file.fileSize / 1024 / 1024).toFixed(1)} MB`
              : ""}
          </div>
        </div>
        {disabled && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            already bound
          </span>
        )}
      </button>
    </li>
  );
}
