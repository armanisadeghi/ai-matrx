import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName } from "@/lib/redux/slices/userSlice";
import type {
  CreateShareRequest,
  CreateShareResponse,
} from "@/types/canvas-social";

export function useCanvasShare() {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = useAppSelector(selectDisplayName);
  const queryClient = useQueryClient();
  const supabase = createClient();

  const generateShareToken = () => {
    // Cryptographically secure, URL-safe token (UUIDv4 → 122 bits of entropy).
    // Never use Math.random() for share tokens — its output is predictable and
    // the token is the only thing gating access to a public/unlisted canvas.
    return crypto.randomUUID().replace(/-/g, "");
  };

  const shareMutation = useMutation({
    mutationFn: async (request: CreateShareRequest) => {
      console.log("🚀 Starting share creation...", { request });
      console.log("📝 Canvas Type:", request.canvas_type);
      console.log("📦 Canvas Data Type:", typeof request.canvas_data);

      const userId = requireUserId();
      console.log("👤 User:", userId);

      const shareToken = generateShareToken();
      // Always use production domain for share links
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
      const url = `${baseUrl}/canvas/shared/${shareToken}`;

      console.log("🔗 Generated share URL:", url);
      console.log("📦 Canvas data:", request.canvas_data);

      // Insert into database
      // Map legacy "unlisted" to canonical platform.visibility "link".
      const visibility =
        request.visibility === "unlisted"
          ? ("link" as const)
          : request.visibility || "public";

      const insertData = {
        share_token: shareToken,
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

      console.log("💾 Inserting to database:", insertData);

      const { data, error } = await supabase
        .schema("canvas").from("shared_canvas_items")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("❌ Database error:", error);
        throw new Error(`Failed to create share: ${error.message}`);
      }

      console.log("✅ Share created successfully:", data);

      return {
        canvas: data,
        share_url: url,
        share_token: shareToken,
      } as CreateShareResponse;
    },
    onSuccess: (response) => {
      console.log("🎉 Share mutation success:", response);
      setShareUrl(response.share_url);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["user-canvases"] });
      queryClient.invalidateQueries({ queryKey: ["discover-canvases"] });
    },
    onError: (err: Error) => {
      console.error("💥 Share mutation error:", err);
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
