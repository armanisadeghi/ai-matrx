"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Copy,
  History,
  Archive,
  Zap,
  MousePointerClick,
  Layers,
  Coffee,
  EyeOff,
  Lock,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ContextStatusBadge } from "./ContextStatusBadge";
import { ContextValuePreview } from "./ContextValuePreview";
import {
  STATUS_TRANSITIONS,
  STATUS_CONFIG,
  FETCH_HINT_CONFIG,
} from "../constants";
import type { ContextItemManifest, ContextItemStatus } from "../types";
import { isContextReviewOverdue } from "../utils/contextItemPresentation";

const FETCH_HINT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Zap,
  MousePointerClick,
  Layers,
  Coffee,
  EyeOff,
};

type Props = {
  item: ContextItemManifest;
  onStatusChange?: (
    itemId: string,
    status: ContextItemStatus,
    note?: string,
  ) => void;
  onDuplicate?: (itemId: string) => void;
  onArchive?: (itemId: string) => void;
};

export function ContextItemCard({
  item,
  onStatusChange,
  onDuplicate,
  onArchive,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const suggestedNext = STATUS_TRANSITIONS[item.status]?.[0];
  const suggestedConfig = suggestedNext ? STATUS_CONFIG[suggestedNext] : null;
  const fetchHintConfig = FETCH_HINT_CONFIG[item.fetch_hint];
  const FetchIcon = fetchHintConfig
    ? FETCH_HINT_ICONS[fetchHintConfig.iconName]
    : null;

  const handleClick = () => {
    startTransition(() => {
      router.push(`/agent-context/items/${item.id}`);
    });
  };

  return (
    <Card
      className={`group relative hover:border-primary/30 transition-colors cursor-pointer ${isPending ? "opacity-60" : ""}`}
      onClick={handleClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">
              {item.display_name}
            </h3>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {item.key}
            </p>
          </div>
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ContextStatusBadge
              status={item.status}
              size="sm"
              interactive
              onStatusChange={(status, note) =>
                onStatusChange?.(item.id, status, note)
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={() => router.push(`/agent-context/items/${item.id}`)}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate?.(item.id)}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/agent-context/items/${item.id}/history`)
                  }
                >
                  <History className="h-3.5 w-3.5 mr-2" /> View History
                </DropdownMenuItem>
                <DropdownMenuItem className="p-0">
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <ContextStatusBadge
                      status={item.status}
                      size="sm"
                      interactive
                      onStatusChange={(status, note) =>
                        onStatusChange?.(item.id, status, note)
                      }
                    />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onArchive?.(item.id)}
                  className="text-destructive"
                >
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Category */}
        {item.category && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5">
            {item.category}
          </Badge>
        )}

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2">
          {item.description}
        </p>

        {/* Value preview */}
        <ContextValuePreview item={item} mode="card" />

        {/* Footer: hints + overdue + action */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={200}>
              {FetchIcon && (
                <Tooltip>
                  <TooltipTrigger>
                    <FetchIcon className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {fetchHintConfig.label}
                  </TooltipContent>
                </Tooltip>
              )}
              {(item.sensitivity === "restricted" ||
                item.sensitivity === "privileged") && (
                <Tooltip>
                  <TooltipTrigger>
                    {item.sensitivity === "privileged" ? (
                      <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {item.sensitivity}
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
            {isContextReviewOverdue(item) && (
              <Badge variant="destructive" className="h-4 text-[10px] px-1">
                Overdue
              </Badge>
            )}
          </div>

          {suggestedNext && suggestedConfig && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 text-[11px] px-2 ${suggestedConfig.colorText}`}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange?.(item.id, suggestedNext);
              }}
            >
              {suggestedConfig.label} &rarr;
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
