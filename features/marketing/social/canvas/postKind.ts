/**
 * One social post as a canvas tab (`social-post`), keyed by the post, so
 * opening the same post again focuses its tab and another post gets its own
 * tab beside it. The same body (`PostDetailBody`) the floating panel and the
 * `/socials/post/[postId]` page render; the post is read again from its row,
 * so the tab comes back after a reload.
 */

import { Clapperboard } from "lucide-react";
import type { CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";

export const SOCIAL_POST_KIND = "social-post";

export type PostTabData = {
  postId: string;
  organizationId: string;
  brandSeg: string;
  title: string;
  tab: string;
};

export function postTabOpenInput(data: Partial<PostTabData> & Pick<PostTabData, "postId" | "organizationId">): CanvasOpenInput {
  const full: PostTabData = {
    postId: data.postId,
    organizationId: data.organizationId,
    brandSeg: data.brandSeg ?? "",
    title: data.title?.trim() || "Post",
    tab: data.tab ?? "overview",
  };
  return { kind: SOCIAL_POST_KIND, key: full.postId, title: full.title, data: full };
}

export function readPostTabData(data: unknown): PostTabData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { postId, organizationId, brandSeg, title, tab } = data as Record<string, unknown>;
  if (typeof postId !== "string" || !postId || typeof organizationId !== "string" || !organizationId) return null;
  return {
    postId,
    organizationId,
    brandSeg: typeof brandSeg === "string" ? brandSeg : "",
    title: typeof title === "string" && title ? title : "Post",
    tab: typeof tab === "string" ? tab : "overview",
  };
}

export const SOCIAL_POST_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<PostTabData>({
  id: SOCIAL_POST_KIND,
  surface: "dom",
  label: "Post",
  icon: Clapperboard,
  load: () => import("./PostCanvasView"),
  title: (data) => data.title || "Post",
  restore: true,
});
