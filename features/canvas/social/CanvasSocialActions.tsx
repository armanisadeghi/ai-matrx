"use client";

import { GitFork, Heart, MessageCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCanvasLike } from "@/hooks/canvas/useCanvasLike";
import { useCanvasShare } from "@/hooks/canvas/useCanvasShare";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface CanvasSocialActionsProps {
  canvasId: string;
  shareToken: string;
  likeCount: number;
  commentCount: number;
  forkCount?: number;
  onCommentClick?: () => void;
  onForkClick?: () => void;
  className?: string;
}

/**
 * The small, always-available action set for a shared canvas header.
 * Descriptive stats live in the canvas details popover; this row keeps only
 * actions so it remains usable beside a long title on a phone.
 */
export function CanvasSocialActions({
  canvasId,
  shareToken,
  likeCount,
  commentCount,
  forkCount = 0,
  onCommentClick,
  onForkClick,
  className,
}: CanvasSocialActionsProps) {
  const { hasLiked, toggleLike, isLoading } = useCanvasLike(canvasId);
  const { copyToClipboard } = useCanvasShare();

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/canvas/shared/${shareToken}`;
    const success = await copyToClipboard(shareUrl);
    if (success) toast.success("Share link copied");
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleLike}
        disabled={isLoading}
        aria-label={hasLiked ? "Unlike canvas" : "Like canvas"}
        title={hasLiked ? "Unlike canvas" : "Like canvas"}
        className={cn(
          "h-11 min-w-11 gap-1 rounded-lg px-2 sm:h-9 sm:min-w-9",
          hasLiked && "text-destructive hover:text-destructive",
        )}
      >
        <Heart
          className={cn("h-4 w-4", hasLiked && "fill-current")}
          aria-hidden="true"
        />
        <span className="text-xs font-medium tabular-nums">{likeCount}</span>
      </Button>

      {onCommentClick ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCommentClick}
          aria-label="Open comments"
          title="Comments"
          className="h-11 min-w-11 gap-1 rounded-lg px-2 sm:h-9 sm:min-w-9"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium tabular-nums">
            {commentCount}
          </span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleShare}
        aria-label="Copy share link"
        title="Copy share link"
        className="h-11 w-11 rounded-lg sm:h-9 sm:w-9"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </Button>

      {onForkClick && forkCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onForkClick}
          aria-label="Open remixes"
          title="Remixes"
          className="h-11 min-w-11 gap-1 rounded-lg px-2 sm:h-9 sm:min-w-9"
        >
          <GitFork className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium tabular-nums">{forkCount}</span>
        </Button>
      ) : null}
    </div>
  );
}
