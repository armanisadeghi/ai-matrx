"use client";

import {
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Tags,
  Plus,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BulkActionBarProps {
  selectedCount: number;
  tags: { id: string; name: string }[];
  onInclude: () => void;
  onExclude: () => void;
  onMarkStale: () => void;
  onMarkComplete: () => void;
  onAddTag: (tagId: string) => void;
  onCreateTag: () => void;
  onClear: () => void;
  busy?: boolean;
}

export function BulkActionBar({
  selectedCount,
  tags,
  onInclude,
  onExclude,
  onMarkStale,
  onMarkComplete,
  onAddTag,
  onCreateTag,
  onClear,
  busy,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-xl border border-border bg-card shadow-lg px-3 py-2 mb-safe">
      <span className="text-sm font-medium tabular-nums mr-1">
        {selectedCount} selected
      </span>
      {busy && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      <div className="h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onInclude}
        disabled={busy}
        className="gap-1.5 text-xs"
      >
        <Eye className="h-3.5 w-3.5" />
        Include
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onExclude}
        disabled={busy}
        className="gap-1.5 text-xs"
      >
        <EyeOff className="h-3.5 w-3.5" />
        Exclude
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="gap-1.5 text-xs"
          >
            <Tags className="h-3.5 w-3.5 text-primary" />
            Add to tag
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="max-h-72 overflow-y-auto"
        >
          <DropdownMenuItem onClick={onCreateTag}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create new tag…
          </DropdownMenuItem>
          {tags.length > 0 && <DropdownMenuSeparator />}
          {tags.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => onAddTag(t.id)}>
              <Tags className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <span className="truncate max-w-[14rem]">{t.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMarkComplete}
        disabled={busy}
        className="gap-1.5 text-xs"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Complete
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMarkStale}
        disabled={busy}
        className="gap-1.5 text-xs"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Stale
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        disabled={busy}
        className="h-6 w-6 rounded-full ml-1"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
