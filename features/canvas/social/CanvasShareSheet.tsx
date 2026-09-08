"use client";

/**
 * CanvasShareSheet — the share surface, on the CANONICAL package overlays.
 *
 * It used to hand-build both halves out of `DialogContentPrimitive` /
 * `DrawerContentPrimitive` plus its own portal, overlay, geometry, motion and
 * z-index. Two defects rode along, both closed here (same class as the
 * `features/notes` confirm collapse, dc8532eb28):
 *
 * 1. THE MOTION CAME FROM A HOST PLUGIN. The desktop card wore
 *    `animate-in` / `zoom-in-95` / `slide-in-from-top-[48%]` — utilities from
 *    `tailwindcss-animate` / `tw-animate-css`, which is a HOST CSS entry this
 *    app happens to load and three of the four AI Matrx consumers never did.
 *    design-system 0.10.0 swept exactly this reliance out of the package
 *    (`FORBIDDEN_HOST_MOTION_UTILITIES` in its `motion.ts`); the canonical
 *    surfaces animate with the package's own `matrx-motion-*` rules instead,
 *    so this copy was the last place in `features/canvas/` still spelling the
 *    animation by hand.
 *
 * 2. THE BESPOKE `z-[20000]` / `z-[20001]` STACK IS GONE. It was load-bearing
 *    for nothing — a census found the 20000 layer existed ONLY in this file,
 *    and `features/canvas/` sets no z-index at all; `CanvasSideSheetImpl`
 *    tops out at the canonical 10000. Sitting ABOVE the dialog layer is
 *    itself the recorded bug class (`features/window-panels/FEATURE.md`,
 *    2026-07-05: a `z-[10001]` popover BURIED the dialogs opened from inside
 *    it, and the global fix was to make the layer EQUAL and let DOM portal
 *    order decide). The canonical surfaces are `z-[10000]`, so a share sheet
 *    opened from a canvas portals later and stacks above it on order alone.
 *    The `selectContentClass` prop that propped the stack up is deleted too:
 *    `DialogContent` PROVIDES its own portal container, so a Select inside it
 *    portals INTO the dialog, and the package's `SelectContent` already
 *    carries `z-[10001]` for the drawer path.
 *
 * Everything the two branches spelled out — portal, overlay, mobile geometry,
 * `dvh` caps, safe-area padding, the 44px grab-handle target, the close
 * control — is package behaviour now. All user-facing copy is unchanged.
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Share2, Link2, Globe, Lock } from "lucide-react";
import { Twitter, Facebook, Linkedin } from "@/components/icons/brand-icons";
import { useCanvasShare } from "@/hooks/canvas/useCanvasShare";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CanvasType, CanvasVisibility } from "@/types/canvas-social";
import { ShareCoverImagePicker } from "./ShareCoverImagePicker";
import { ProTextarea } from "@/components/official/ProTextarea";

// ============================================================================
// TYPES
// ============================================================================

interface CanvasShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasData: any;
  canvasType: CanvasType;
  defaultTitle?: string;
  defaultDescription?: string;
  hasScoring?: boolean;
}

// ============================================================================
// SHARED FORM CONTENT
// ============================================================================

function ShareFormContent({
  canvasType,
  hasScoring,
  title,
  setTitle,
  description,
  setDescription,
  tags,
  setTags,
  thumbnailUrl,
  setThumbnailUrl,
  visibility,
  setVisibility,
  allowRemixes,
  setAllowRemixes,
  requireAttribution,
  setRequireAttribution,
  shareUrl,
  copied,
  isSharing,
  onShare,
  onCopy,
  onSocialShare,
  onClose,
}: {
  canvasType: CanvasType;
  hasScoring: boolean;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
  thumbnailUrl: string | null;
  setThumbnailUrl: (v: string | null) => void;
  visibility: CanvasVisibility;
  setVisibility: (v: CanvasVisibility) => void;
  allowRemixes: boolean;
  setAllowRemixes: (v: boolean) => void;
  requireAttribution: boolean;
  setRequireAttribution: (v: boolean) => void;
  shareUrl: string | null;
  copied: boolean;
  isSharing: boolean;
  onShare: () => void;
  onCopy: () => void;
  onSocialShare: (platform: "twitter" | "facebook" | "linkedin") => void;
  onClose: () => void;
}) {
  if (shareUrl) {
    return (
      <div className="space-y-5">
        {/* Cover preview — shows what will appear in social share previews */}
        {thumbnailUrl && (
          <div className="space-y-2">
            <Label>Social Preview</Label>
            <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-lg border border-border">
              <InlineMediaRef
                ref={thumbnailUrl}
                size="fill"
                fit="cover"
                rounded="none"
                fallback={null}
                className="absolute inset-0"
                alt="Social share cover"
              />
            </div>
          </div>
        )}

        {/* Share URL */}
        <div className="space-y-2">
          <Label>Share Link</Label>
          <div className="flex gap-2 w-full">
            <Input
              value={shareUrl}
              readOnly
              className="flex-1 font-mono text-sm min-w-0"
            />
            <Button
              onClick={onCopy}
              variant="outline"
              className="flex-shrink-0 whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Social Share */}
        <div className="space-y-2">
          <Label>Share to Social Media</Label>
          <div className="flex gap-2">
            <Button
              onClick={() => onSocialShare("twitter")}
              variant="outline"
              className="flex-1"
            >
              <Twitter className="w-4 h-4 mr-2" />
              Twitter
            </Button>
            <Button
              onClick={() => onSocialShare("facebook")}
              variant="outline"
              className="flex-1"
            >
              <Facebook className="w-4 h-4 mr-2" />
              Facebook
            </Button>
            <Button
              onClick={() => onSocialShare("linkedin")}
              variant="outline"
              className="flex-1"
            >
              <Linkedin className="w-4 h-4 mr-2" />
              LinkedIn
            </Button>
          </div>
        </div>

        {/* Settings Summary */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Visibility</span>
            <Badge
              variant="outline"
              className="capitalize flex items-center gap-1"
            >
              {visibility === "public" && <Globe className="w-3 h-3" />}
              {visibility === "unlisted" && <Link2 className="w-3 h-3" />}
              {visibility === "personal" && <Lock className="w-3 h-3" />}
              {visibility}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Allow Remixes</span>
            <span className="font-medium">{allowRemixes ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Require Attribution</span>
            <span className="font-medium">
              {requireAttribution ? "Yes" : "No"}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="details" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* Fixed-height tab body so the modal never resizes between tabs */}
      <div className="h-[480px] relative mt-4">
        <TabsContent
          value="details"
          className="absolute inset-0 overflow-y-auto space-y-4 m-0 pr-1"
        >
          <div className="space-y-2">
            <Label htmlFor="share-title">Title *</Label>
            <Input
              id="share-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your canvas a title..."
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-description">Description</Label>
            <ProTextarea
              id="share-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what your canvas is about..."
              rows={2}
              maxLength={500}
            />
          </div>

          <ShareCoverImagePicker
            value={thumbnailUrl}
            onChange={setThumbnailUrl}
            disabled={isSharing}
          />

          <div className="space-y-2">
            <Label htmlFor="share-tags">Tags (comma separated)</Label>
            <Input
              id="share-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="quiz, education, fun..."
            />
          </div>

          <div className="flex items-center gap-2 pb-1">
            <Badge variant="outline" className="capitalize">
              {canvasType.replace("-", " ")}
            </Badge>
            {hasScoring && <Badge variant="secondary">Scored</Badge>}
          </div>
        </TabsContent>

        <TabsContent
          value="settings"
          className="absolute inset-0 overflow-y-auto space-y-3 m-0 pr-1"
        >
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v: CanvasVisibility) => setVisibility(v)}
            >
              <SelectTrigger className="h-10 [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                <SelectValue>
                  {visibility === "public" && (
                    <>
                      <Globe className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>Public</span>
                    </>
                  )}
                  {visibility === "unlisted" && (
                    <>
                      <Link2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>Unlisted</span>
                    </>
                  )}
                  {visibility === "personal" && (
                    <>
                      <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>Private</span>
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="public"
                  textValue="Public"
                  className="py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm leading-none">
                        Public
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Anyone can find and view
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem
                  value="unlisted"
                  textValue="Unlisted"
                  className="py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Link2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm leading-none">
                        Unlisted
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Only people with the link can view
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem
                  value="private"
                  textValue="Private"
                  className="py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm leading-none">
                        Private
                      </div>
                      {/* Honest claim only: this setting controls publication
                          of the share record, not every access path to the
                          underlying content (D106b) — never "Only you". */}
                      <div className="text-xs text-muted-foreground mt-1">
                        Not published — no public page or link access
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-lg border border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Allow Remixes</Label>
              <p className="text-xs text-muted-foreground">
                Let others fork and modify your canvas
              </p>
            </div>
            <Switch checked={allowRemixes} onCheckedChange={setAllowRemixes} />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-lg border border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Require Attribution</Label>
              <p className="text-xs text-muted-foreground">
                Remixes must credit you as original creator
              </p>
            </div>
            <Switch
              checked={requireAttribution}
              onCheckedChange={setRequireAttribution}
              disabled={!allowRemixes}
            />
          </div>
        </TabsContent>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onShare} disabled={isSharing || !title.trim()}>
          {isSharing ? "Creating..." : "Create Share Link"}
        </Button>
      </div>
    </Tabs>
  );
}

// ============================================================================
// SHARED LOGIC HOOK
// ============================================================================

function useShareLogic({
  open,
  onOpenChange,
  canvasData,
  canvasType,
  defaultTitle,
  defaultDescription,
  hasScoring,
}: CanvasShareSheetProps) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<CanvasVisibility>("public");
  const [allowRemixes, setAllowRemixes] = useState(true);
  const [requireAttribution, setRequireAttribution] = useState(true);
  const [tags, setTags] = useState("");
  const [copied, setCopied] = useState(false);

  const { share, shareUrl, error, copyToClipboard, isSharing, reset } =
    useCanvasShare();
  const { toast } = useToast();

  useEffect(() => {
    if (open) return undefined;

    const resetTimer = window.setTimeout(() => {
      reset();
      setCopied(false);
      setThumbnailUrl(null);
    }, 300);

    return () => window.clearTimeout(resetTimer);
  }, [open, reset]);

  useEffect(() => {
    if (shareUrl) {
      toast({
        title: "Share link created!",
        description: "Your canvas is now shareable",
      });
    }
  }, [shareUrl, toast]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Failed to create share",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleShare = () => {
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your canvas",
        variant: "destructive",
      });
      return;
    }
    share({
      canvas_data: canvasData,
      title: title.trim(),
      description: description.trim() || undefined,
      canvas_type: canvasType,
      thumbnail_url: thumbnailUrl,
      visibility,
      allow_remixes: allowRemixes,
      require_attribution: requireAttribution,
      has_scoring: hasScoring ?? false,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      categories: [],
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Share link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSocialShare = (platform: "twitter" | "facebook" | "linkedin") => {
    if (!shareUrl) return;
    const text = encodeURIComponent(title);
    const url = encodeURIComponent(shareUrl);
    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    window.open(urls[platform], "_blank", "width=600,height=400");
  };

  return {
    title,
    setTitle,
    description,
    setDescription,
    thumbnailUrl,
    setThumbnailUrl,
    visibility,
    setVisibility,
    allowRemixes,
    setAllowRemixes,
    requireAttribution,
    setRequireAttribution,
    tags,
    setTags,
    copied,
    shareUrl,
    isSharing,
    handleShare,
    handleCopy,
    handleSocialShare,
  };
}

// ============================================================================
// MOBILE BOTTOM SHEET
// ============================================================================

function MobileCanvasShareSheet(props: CanvasShareSheetProps) {
  const logic = useShareLogic(props);

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      {/* `size="full"` per the package rule: this body VARIES (tabs, and a
          different pane once a share link exists), and an adaptive drawer
          would resize under the user's thumb as it changes. */}
      <DrawerContent size="full">
        <DrawerHeader className="gap-1 px-4 pt-3 pb-2 text-left">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-muted-foreground" />
            <DrawerTitle className="text-base font-semibold">
              Share Canvas
            </DrawerTitle>
          </div>
          <DrawerDescription className="text-sm text-muted-foreground">
            {logic.shareUrl
              ? "Your canvas is now shareable!"
              : "Create a shareable link for your canvas"}
          </DrawerDescription>
        </DrawerHeader>

        {/* DrawerContent's bottom posture already carries `pb-safe`. */}
        <DrawerBody className="pb-4">
          <ShareFormContent
            {...logic}
            canvasType={props.canvasType}
            hasScoring={props.hasScoring ?? false}
            onShare={logic.handleShare}
            onCopy={logic.handleCopy}
            onSocialShare={logic.handleSocialShare}
            onClose={() => props.onOpenChange(false)}
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// DESKTOP DIALOG
// ============================================================================

function DesktopCanvasShareSheet(props: CanvasShareSheetProps) {
  const logic = useShareLogic(props);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* `mobileSheet={false}` because the mobile presentation is the Drawer
          branch above (host doctrine: Drawer, not Dialog, on mobile), not the
          package's built-in bottom sheet. The close control, portal, overlay
          and motion are the package's. */}
      <DialogContent mobileSheet={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Canvas
          </DialogTitle>
          <DialogDescription>
            {logic.shareUrl
              ? "Your canvas is now shareable!"
              : "Create a shareable link for your canvas"}
          </DialogDescription>
        </DialogHeader>

        <ShareFormContent
          {...logic}
          canvasType={props.canvasType}
          hasScoring={props.hasScoring ?? false}
          onShare={logic.handleShare}
          onCopy={logic.handleCopy}
          onSocialShare={logic.handleSocialShare}
          onClose={() => props.onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// UNIFIED EXPORT — Drawer on mobile, Dialog on desktop
// ============================================================================

export function CanvasShareSheet(props: CanvasShareSheetProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <MobileCanvasShareSheet {...props} />
  ) : (
    <DesktopCanvasShareSheet {...props} />
  );
}
