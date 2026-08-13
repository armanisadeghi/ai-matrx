import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName } from "@/lib/redux/slices/userSlice";
import { createShareLink } from "@/utils/permissions/shareLinks";
import type {
  CreateShareRequest,
  CreateShareResponse,
  SharedCanvasItem,
} from "@/types/canvas-social";

export function useCanvasShare() {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = useAppSelector(selectDisplayName);
  const queryClient = useQueryClient();
  const supabase = createClient();

  const shareMutation = useMutation({
    mutationFn: async (request: CreateShareRequest) => {
      const userId = requireUserId();

      // 1) Publish the snapshot — a content write, not the share itself.
      // Map legacy "unlisted" to canonical platform.visibility "link".
      const visibility =
        request.visibility === "unlisted"
          ? ("link" as const)
          : request.visibility || "public";

      const insertData = {
        title: request.title,
        description: request.description,
        canvas_type: request.canvas_type,
        canvas_data: request.canvas_data,
        thumbnail_url: request.thumbnail_url ?? null,
        visibility,
        allow_remixes: request.allow_remixes !== false,
        require_attribution: request.require_attribution !== false,
        has_scoring: request.has_scoring || false,
        tags: request.tags || [],
        categories: request.categories || [],
        created_by: userId,
        creator_username: displayName,
        creator_display_name: displayName,
        published_at: new Date().toISOString(),
        organization_id: await ensureOrgId(undefined),
      };

      const { data, error } = await supabase
        .schema("canvas").from("shared_canvas_items")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create share: ${error.message}`);
      }
      const canvas = data as SharedCanvasItem;

      // 2) Mint the link through the ONE canonical lane (platform.share_links).
      // The token is the visitor's authorization; revoke/list live in the
      // standard ShareModal machinery.
      const link = await createShareLink({
        resourceType: "shared_canvas_item",
        resourceId: canvas.id,
      });
      if (!link.success || !link.token) {
        throw new Error(link.error ?? "Failed to create share link");
      }

      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
      return {
        canvas,
        share_url: `${baseUrl}/canvas/shared/${link.token}`,
        share_token: link.token,
      } as CreateShareResponse;
    },
    onSuccess: (response) => {
      setShareUrl(response.share_url);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["user-canvases"] });
      queryClient.invalidateQueries({ queryKey: ["discover-canvases"] });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create share");
      setShareUrl(null);
    },
  });

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (err) {
      console.error("Failed to copy:", err);
      return false;
    }
  };

  return {
    share: shareMutation.mutate,
    shareAsync: shareMutation.mutateAsync,
    isSharing: shareMutation.isPending,
    shareUrl,
    error,
    copyToClipboard,
    reset: () => {
      setShareUrl(null);
      setError(null);
      shareMutation.reset();
    },
  };
}
