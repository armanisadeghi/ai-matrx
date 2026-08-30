"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Eye, Heart, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { MediumComponentLoading } from "@/components/matrx/LoadingComponents";
import {
  PUBLIC_HEADER_ICON_BUTTON,
  PUBLIC_HEADER_ROW,
} from "@/components/matrx/publicHeaderChrome";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { useSharedCanvas } from "@/hooks/canvas/useSharedCanvas";
import { cn } from "@/lib/utils";

import { CanvasLeaderboard } from "../leaderboard/CanvasLeaderboard";
import { CanvasSocialActions } from "../social/CanvasSocialActions";
import { PublicCanvasRenderer } from "./PublicCanvasRenderer";

interface SharedCanvasViewProps {
  shareToken: string;
  className?: string;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SharedCanvasView({
  shareToken,
  className = "h-full min-h-0",
}: SharedCanvasViewProps) {
  const { data: canvas, isLoading, error } = useSharedCanvas(shareToken);

  if (isLoading) {
    return (
      <div className={cn(className, "bg-textured")}>
        <MediumComponentLoading />
      </div>
    );
  }

  if (error || !canvas) {
    return (
      <div
        className={cn(
          className,
          "flex items-center justify-center bg-textured p-4",
        )}
      >
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
            <AlertCircle
              className="h-7 w-7 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-foreground">
            We couldn&apos;t open this canvas
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            This link may be incorrect, expired, or no longer shared.
          </p>
          <Button asChild className="w-full max-w-xs">
            <Link href="/">Go to AI Matrx</Link>
          </Button>
        </div>
      </div>
    );
  }

  const creatorName =
    canvas.creator_display_name ?? canvas.creator_username ?? "Anonymous";

  return (
    <section
      className={cn(
        className,
        "flex flex-col overflow-hidden bg-textured text-foreground",
      )}
      aria-label={`Shared canvas: ${canvas.title}`}
    >
      <header
        className={cn(
          PUBLIC_HEADER_ROW,
          "z-30 flex shrink-0 items-center gap-1 border-b border-glass-edge bg-glass px-2 shadow-glass backdrop-blur-glass backdrop-saturate-glass sm:px-3",
        )}
      >
        <Link
          href="/"
          aria-label="AI Matrx home"
          className={cn(
            PUBLIC_HEADER_ICON_BUTTON,
            "flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Image
            src="/matrx/matrx-icon.svg"
            width={20}
            height={20}
            alt=""
            priority
          />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-semibold sm:text-base">
            {canvas.title}
          </h1>
          <Badge
            variant="outline"
            className="hidden shrink-0 capitalize sm:inline-flex"
          >
            {canvas.canvas_type.replace("-", " ")}
          </Badge>
          {canvas.has_scoring ? (
            <Badge
              variant="secondary"
              className="hidden shrink-0 md:inline-flex"
            >
              <Trophy className="mr-1 h-3 w-3" aria-hidden="true" />
              Scored
            </Badge>
          ) : null}
        </div>

        <CanvasSocialActions
          canvasId={canvas.id}
          shareToken={shareToken}
          likeCount={canvas.like_count}
          commentCount={canvas.comment_count}
          forkCount={canvas.fork_count}
        />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`About this canvas by ${creatorName}`}
              title="Canvas details"
              className={cn(
                PUBLIC_HEADER_ICON_BUTTON,
                "flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Avatar className="h-7 w-7 border border-border">
                <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                  {initials(canvas.creator_display_name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={4}
            className="max-h-[min(34rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto p-0"
          >
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                  {initials(canvas.creator_display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{creatorName}</p>
                <p className="text-xs text-muted-foreground">
                  Shared{" "}
                  {formatDistanceToNow(new Date(canvas.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {canvas.description ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {canvas.description}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Views
                  </div>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {canvas.view_count.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                    Likes
                  </div>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {canvas.like_count.toLocaleString()}
                  </p>
                </div>
                {canvas.has_scoring ? (
                  <>
                    <div className="rounded-lg border border-border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">
                        High score
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {canvas.high_score ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Attempts</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {canvas.total_attempts.toLocaleString()}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              {canvas.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {canvas.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {canvas.has_scoring ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Trophy
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    Leaderboard
                  </h2>
                  <CanvasLeaderboard canvasId={canvas.id} />
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PublicCanvasRenderer
          content={{
            type: canvas.canvas_type,
            data: canvas.canvas_data,
            metadata: {
              title: canvas.title,
              description: canvas.description,
            },
          }}
        />
      </div>
    </section>
  );
}
