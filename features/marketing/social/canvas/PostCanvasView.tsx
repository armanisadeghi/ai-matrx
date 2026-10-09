"use client";

/**
 * The body of a `social-post` canvas tab: THE post body (`PostDetailBody`),
 * the same one the floating panel and the full page render. "Open as panel"
 * hands the post to the floating window and closes the tab.
 */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { useOpenSocialPost } from "@/features/overlays/openers/socialPostWindow";
import { PostDetailBody, type DetailTab } from "../components/PostDetail";
import { readPostTabData } from "./postKind";

export default function PostCanvasView({ item, data, canvas }: CanvasKindProps) {
  const openPanel = useOpenSocialPost();
  const post = readPostTabData(data);
  if (!post) {
    return <p className="p-4 text-sm text-muted-foreground">This tab names no post.</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PostDetailBody
        key={post.postId}
        postId={post.postId}
        organizationId={post.organizationId}
        brandSeg={post.brandSeg}
        initialTab={post.tab as DetailTab}
        host="canvas"
        onSwitchHost={() => {
          openPanel({ postId: post.postId, organizationId: post.organizationId, brandSeg: post.brandSeg, tab: post.tab });
          canvas.close(item.id);
        }}
      />
    </div>
  );
}
