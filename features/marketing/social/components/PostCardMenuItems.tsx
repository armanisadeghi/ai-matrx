"use client";

/**
 * The `⋯` items of a post card that need a brand: open the creator's account, save to the swipe file,
 * get the transcript, run the breakdown. They run the SAME functions the post window's buttons and the
 * agent's tools run (`usePostActions`), and each one that spends names its points on the row.
 * Mounted only while the menu is open, so a grid of cards costs nothing.
 */

import Link from "next/link";
import { Bookmark, FileText, Sparkles, UserRound } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";

import { accountHref } from "../account-href";
import { useSocialSpend } from "../cost";
import type { PostCardModel } from "../types";
import { usePostActions } from "./usePostActions";

function CostTail({ text }: { text: string | null }) {
  return text ? <span className="ml-auto pl-3 text-[11px] tabular-nums text-muted-foreground">{text}</span> : null;
}

export function PostCardMenuItems({
  post,
  brandSeg,
  organizationId,
  hasSaveHandler,
}: {
  post: PostCardModel;
  brandSeg: string;
  organizationId: string;
  /** The host already offers Save to swipe file; do not add a second one. */
  hasSaveHandler: boolean;
}) {
  const actions = usePostActions({
    postId: post.postId,
    organizationId,
    hasTranscript: false,
    openDetail: () => {},
  });
  const { pointsText } = useSocialSpend(organizationId);
  const href = accountHref(brandSeg, post);

  const run = (fn: () => Promise<string>) => () =>
    void fn().then(
      (message) => toast.success(message),
      (err: unknown) => toast.error(err instanceof Error ? err.message : "That didn't work"),
    );

  return (
    <>
      {href ? (
        <DropdownMenuItem asChild>
          <Link href={href}>
            <UserRound className="mr-2 h-4 w-4" />
            Open account
          </Link>
        </DropdownMenuItem>
      ) : null}
      {hasSaveHandler ? null : (
        <DropdownMenuItem disabled={actions.busy === "save"} onSelect={run(actions.saveToSwipe)}>
          <Bookmark className="mr-2 h-4 w-4" />
          Save to swipe file
        </DropdownMenuItem>
      )}
      <DropdownMenuItem disabled={actions.busy === "transcript"} onSelect={run(actions.transcript)}>
        <FileText className="mr-2 h-4 w-4" />
        Get transcript
        <CostTail text={pointsText("transcript")} />
      </DropdownMenuItem>
      <DropdownMenuItem disabled={actions.busy === "breakdown"} onSelect={run(actions.breakdown)}>
        <Sparkles className="mr-2 h-4 w-4" />
        Run breakdown
        <CostTail text="AI points" />
      </DropdownMenuItem>
    </>
  );
}
