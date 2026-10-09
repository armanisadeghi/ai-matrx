"use client";

/**
 * One social post as a floating, non-blocking panel.
 *
 * CHROME ONLY. It wraps exactly ONE `<PostDetailBody>` — the body the
 * `/socials/post/[postId]` page and the `social-post` canvas tab render
 * (CLAUDE.md § A WINDOW PANEL WRAPS THE CANONICAL COMPONENT). The title bar is
 * the one header row: platform mark, handle, and the way to move the post into
 * the canvas.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelRightOpen } from "lucide-react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";

import { Button } from "@ai-matrx/design-system/controls";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { postTabOpenInput } from "@/features/marketing/social/canvas/postKind";
import { PostDetailBody, type DetailTab } from "@/features/marketing/social/components/PostDetail";
import { postPanelOutOfScope } from "@/features/marketing/social/panelScope";

export interface SocialPostWindowProps {
  onClose: () => void;
  /** The overlay instanceId = the post id; also the window-manager id. */
  instanceId: string;
  stackIndex?: number;
  postId: string;
  organizationId: string;
  brandSeg: string;
  initialTab?: string;
  landscape?: boolean;
}

const WIDTH = 760;
const HEIGHT = 580;
/** A landscape post's panel: media 22rem wide is ~200px tall, so the panel is short. */
const LANDSCAPE_HEIGHT = 400;

export default function SocialPostWindow({
  onClose,
  instanceId,
  stackIndex = 0,
  postId,
  organizationId,
  brandSeg,
  initialTab = "overview",
  landscape = false,
}: SocialPostWindowProps) {
  const canvas = useOptionalCanvas();
  const [title, setTitle] = useState("Post");

  // Scoped to its brand's pages: another brand's Studio, /board or any page outside the brand closes it
  // (it must never reopen over a different client's data, however it was restored).
  const pathname = usePathname();
  const outOfScope = postPanelOutOfScope({ brandSeg, pathname });
  useEffect(() => {
    if (outOfScope) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfScope]);
  if (outOfScope) return null;

  // Cascade so a second post never lands exactly on the first.
  const cascade = (stackIndex % 8) * 28;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.min(WIDTH, vw - 32);
  const height = Math.min(landscape ? LANDSCAPE_HEIGHT : HEIGHT, vh - 96);
  const rect = {
    width,
    height,
    x: Math.max(8, Math.min(vw - width - 24 - cascade, vw - width - 8)),
    y: Math.max(64, Math.min(72 + cascade, vh - height - 8)),
  };

  return (
    <WindowPanel
      id={instanceId}
      title={title}
      onClose={onClose}
      overlayId="socialPostWindow"
      overlayInstanceId={instanceId}
      urlSyncId={postId}
      urlSyncArgs={{ o: organizationId, ...(brandSeg ? { b: brandSeg } : {}) }}
      minWidth={340}
      minHeight={320}
      initialRect={rect}
      onCollectData={() => ({ postId, organizationId, brandSeg, tab: initialTab })}
      actionsRight={
        <Button
          variant="quiet"
          icon={<PanelRightOpen />}
          title="Open in the canvas"
          onClick={() => {
            const id = openCanvasItem(
              canvas,
              postTabOpenInput({ postId, organizationId, brandSeg, title, tab: initialTab }),
            );
            if (id) onClose();
          }}
        >
          Canvas
        </Button>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <PostDetailBody
        key={postId}
        postId={postId}
        organizationId={organizationId}
        brandSeg={brandSeg}
        initialTab={initialTab as DetailTab}
        host="window"
        onTitle={setTitle}
      />
    </WindowPanel>
  );
}
