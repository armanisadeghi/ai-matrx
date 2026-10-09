"use client";

import {
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
  tags: { id: string; name: string }[];
  onInclude: () => void;
  onExclude: () => void;
  onMarkStale: () => void;
  onMarkComplete: () => void;
  onAddTag: (tagId: string) => void;
  onCreateTag: () => void;
  busy?: boolean;
}

/** The research sources bulk actions, drawn inside the table's own selection bar (it owns the count and Clear). */
export function BulkActionBar({
  tags,
  onInclude,
  onExclude,
  onMarkStale,
  onMarkComplete,
  onAddTag,
  onCreateTag,
  busy,
}: BulkActionBarProps) {
  return (
    <>
      {busy && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      <Button
        icon={<Eye />}
        variant="quiet"
        onClick={onInclude}
        disabled={busy}
      >
        Include
      </Button>
      <Button
        icon={<EyeOff />}
        variant="quiet"
        onClick={onExclude}
        disabled={busy}
      >
        Exclude
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={<Tags className="text-primary" />} iconEnd={<ChevronDown className="opacity-60" />}
            variant="quiet"
            disabled={busy}
          >
            Add to tag
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
        icon={<CheckCircle2 />}
        variant="quiet"
        onClick={onMarkComplete}
        disabled={busy}
      >
        Complete
      </Button>
      <Button
        icon={<AlertTriangle />}
        variant="quiet"
        onClick={onMarkStale}
        disabled={busy}
      >
        Stale
      </Button>
    </>
  );
}
