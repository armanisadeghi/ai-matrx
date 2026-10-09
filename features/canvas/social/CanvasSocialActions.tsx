"use client";

import { GitFork, Heart, MessageCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
import { useCanvasLike } from "@/hooks/canvas/useCanvasLike";
import { useCanvasShare } from "@/hooks/canvas/useCanvasShare";
import { cn } from "@/lib/utils";
import { copyNotify } from "@/lib/clipboard/copy-notify";

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
    if (success) copyNotify("Share link copied", "success");
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <SurfaceButton
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
      </SurfaceButton>

      {onCommentClick ? (
        <SurfaceButton
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
        </SurfaceButton>
      ) : null}

      <Button
        icon={<Share2 aria-hidden="true" />}
        type="button"
        variant="quiet"
        onClick={handleShare}
        aria-label="Copy share link"
        title="Copy share link"
      />

      {onForkClick && forkCount > 0 ? (
        <SurfaceButton
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
        </SurfaceButton>
      ) : null}
    </div>
  );
}
