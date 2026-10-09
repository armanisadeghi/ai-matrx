"use client";

/**
 * THE way a Socials surface opens a post: the floating panel (window), never a
 * blocking drawer. Reads the brand from context; surfaces outside a brand
 * (board tiles) call `useOpenSocialPost` with their own organization.
 */

import { useCallback } from "react";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useOpenSocialPost } from "@/features/overlays/openers/socialPostWindow";
import { guessAspect } from "./components/PostMedia";
import type { DetailTab } from "./components/PostDetail";

export function useOpenPost() {
  const brand = useMarketingBrand();
  const open = useOpenSocialPost();
  return useCallback(
    (post: { postId: string; platform?: string; format?: string }, tab?: DetailTab) => {
      const landscape = post.platform && post.format ? guessAspect(post.format, post.platform) >= 1 : undefined;
      open({ postId: post.postId, organizationId: brand.organizationId, brandSeg: brand.seg, tab, landscape });
    },
    [open, brand.organizationId, brand.seg],
  );
}
