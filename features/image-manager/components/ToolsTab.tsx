"use client";

/**
 * features/image-manager/components/ToolsTab.tsx
 *
 * Secondary "Tools" landing inside the Image Manager hub. Surfaces the
 * smaller image-related utilities scattered across the codebase so they
 * stop being unfindable. Each card either:
 *   • opens an external route in a new tab (Studio Presets, Photos view),
 *   • opens a floating window via the overlay system (Lightbox, Gallery),
 *   • runs an inline action (Screenshot), or
 *   • expands an inline tool (Crop) within this same tab.
 *
 * Adding a new tool: append a `ToolDescriptor` to the `TOOLS` array
 * below. No other file needs to change.
 */

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  Crop as CropIcon,
  CloudUpload,
  ExternalLink,
  Eye,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  MousePointer,
  Search,
  Smile,
  Squircle,
  type LucideIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { openImageViewer } from "@/features/window-panels/windows/image/openImageViewer";
import { useSelectedImages } from "@/components/image/context/SelectedImagesProvider";
import { useScreenshot } from "@/hooks/useScreenshot";
import ImageCropperWithSelect from "@/components/official/image-cropper/ImageCropperWithSelect";
import { toast } from "sonner";

interface ToolDescriptor {
  id: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  description: string;
  /** Render the action button — the click handler is whatever the tool needs. */
  action: ToolAction;
  /** When provided, expanding the tool reveals an inline body inside this tab. */
  expand?: () => React.ReactNode;
  /** Visual lift for items in the Beta group — adds a small "BETA" pill. */
  beta?: boolean;
  /** When set, surfaces a subtle warning banner under the description. */
  warning?: string;
}

type ToolAction =
  | { kind: "expand"; label: string }
  | { kind: "openOverlay"; label: string; overlayId: OverlayId }
  | { kind: "openLink"; label: string; href: string; external?: boolean }
  | { kind: "callback"; label: string; run: () => void | Promise<void> };

export function ToolsTab() {
  const dispatch = useAppDispatch();
  const { selectedImages } = useSelectedImages();
  const screenshot = useScreenshot({ autoCompress: true });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleLightbox = () => {
    if (selectedImages.length === 0) {
      toast.info(
        "Select an image first — Lightbox plays back what's in your selection.",
      );
      return;
    }
    openImageViewer(dispatch, {
      images: selectedImages.map((img) => img.url),
      alts: selectedImages.map(
        (img) =>
          (img.metadata?.title as string | undefined) ??
          (img.metadata?.description as string | undefined) ??
          img.id,
      ),
      title: "Selection viewer",
    });
  };

  const handleScreenshot = async () => {
    try {
      const result = await screenshot.captureScreen();
      if (!result) {
        toast.error("Couldn't capture the screen");
        return;
      }
      // Open immediately in the floating viewer for review.
      openImageViewer(dispatch, {
        images: [result.fullSize],
        title: "Screenshot",
      });
      toast.success("Screenshot ready — opened in the viewer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Screenshot failed";
      toast.error(message);
    }
  };

  const tools: ToolDescriptor[] = [
    {
      id: "crop",
      label: "Crop",
      icon: CropIcon,
      iconColor: "text-fuchsia-500",
      description:
        "Pick an image, drag a crop rectangle, get a cropped data URL back. Inline tool — no extra window.",
      action: { kind: "expand", label: "Open" },
      expand: () => <InlineCropTool />,
    },
    {
      id: "crop-studio",
      label: "Crop Studio (one or many)",
      icon: CloudUpload,
      iconColor: "text-indigo-500",
      description:
        'Drop a single image or a whole batch. Each becomes its own tab; crop them individually, or set the rectangle once and click "Apply to all" to copy it — proportional to each image\'s natural size — across the batch. Saves directly to the cloud folder you pick.',
      action: {
        kind: "openOverlay",
        label: "Open Crop Studio",
        overlayId: "cropStudioWindow",
      },
    },
    {
      id: "lightbox",
      label: "Lightbox",
      icon: Eye,
      iconColor: "text-sky-500",
      description:
        "Open every image in your current selection in the floating viewer. Zoom, pan, page through, download.",
      action: {
        kind: "callback",
        label: "Play selection",
        run: handleLightbox,
      },
    },
    {
      id: "gallery",
      label: "Floating Gallery",
      icon: Layers,
      iconColor: "text-emerald-500",
      description:
        "Pop a free-floating Unsplash gallery so you can keep browsing while another tab is in focus.",
      action: {
        kind: "openOverlay",
        label: "Open gallery",
        overlayId: "galleryWindow",
      },
    },
    {
      id: "screenshot",
      label: "Screenshot",
      icon: Camera,
      iconColor: "text-amber-500",
      description:
        "Capture the current viewport (excluding panels marked `data-screenshot-exclude`). Useful for bug reports and feedback.",
      action: {
        kind: "callback",
        label: "Capture",
        run: handleScreenshot,
      },
    },
    {
      id: "presets",
      label: "Presets reference",
      icon: ImageIcon,
      iconColor: "text-violet-500",
      description:
        "Read-only catalog of every Image Studio preset (60+ across 10 categories) — perfect for picking the right export size.",
      action: {
        kind: "openLink",
        label: "Open catalog",
        href: "/images/presets",
        external: true,
      },
    },
    {
      id: "photos",
      label: "Photos view",
      icon: ImageIcon,
      iconColor: "text-rose-500",
      description:
        "Image-MIME filtered view of your full cloud-files tree — better for managing photos than the All Files tab.",
      action: {
        kind: "openLink",
        label: "Open Photos",
        href: "/files/photos",
        external: true,
      },
    },
    {
      id: "compact-picker",
      label: "Compact picker",
      icon: MousePointer,
      iconColor: "text-cyan-500",
      description:
        "Reference for the form-helper components: <SingleImageSelect>, <ImageManagerRow>, <ImageManagerIcon>. Use these to pull the Image Manager into your own UI.",
      action: {
        kind: "openLink",
        label: "View demos",
        href: "/admin/official-components",
        external: true,
      },
    },
    {
      id: "favicons",
      label: "Favicons",
      icon: Smile,
      iconColor: "text-pink-500",
      description:
        "Every agent app and prompt app gets a procedurally-generated, colored, letter-based favicon via /api/agent-apps/generate-favicon. Runs at app-create time — this card is the entry point for that flow's docs.",
      action: {
        kind: "openLink",
        label: "Read docs",
        href: "/admin/official-components",
        external: true,
      },
    },
  ];

  // ─── Beta — legacy / candidate-for-removal surfaces ─────────────────────
  // Items here are tracked in `features/image-manager/CLEANUP-CANDIDATES.md`.
  // They live in this group so we can verify nothing essential was missed
  // before deleting them. If something here turns out to be essential, lift
  // it into the main tools array (or a primary section) and remove it from
  // CLEANUP-CANDIDATES.md.
  const betaTools: ToolDescriptor[] = [
    {
      id: "legacy-image-editor",
      label: "Legacy image editor",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      beta: true,
      description:
        "Fabric.js-based editor — `components/advanced-image-editor/`. Currently broken under Turbopack (jsdom dep). The placeholder route confirms the disable.",
      warning: "Disabled while we finish the Next.js 16 / Turbopack migration.",
      action: {
        kind: "openLink",
        label: "Open placeholder",
        href: "/image-editing",
        external: true,
      },
    },
    {
      id: "legacy-parallax-gallery",
      label: "Parallax gallery (legacy)",
      icon: Layers,
      iconColor: "text-zinc-500",
      beta: true,
      description:
        "Original `<ParallaxScrollAdvanced>` demo from `components/matrx/parallax-scroll/`. Sole consumer is this route — slated for deletion alongside the parallax-scroll component.",
      action: {
        kind: "openLink",
        label: "Open gallery",
        href: "/image-editing/gallery",
        external: true,
      },
    },
    {
      id: "legacy-public-image-search",
      label: "Public image search (standalone)",
      icon: Search,
      iconColor: "text-zinc-500",
      beta: true,
      description:
        "Standalone demo of the legacy `<PublicImageSearch>` modal. The component itself stays (now proxied via `/api/unsplash`); only the demo page is redundant — Public Images already covers this in-hub.",
      action: {
        kind: "openLink",
        label: "Open demo",
        href: "/image-editing/public-image-search",
        external: true,
      },
    },
    {
      id: "legacy-easy-cropper",
      label: "Easy cropper (legacy)",
      icon: Squircle,
      iconColor: "text-zinc-500",
      beta: true,
      description:
        "`<EasyImageCropper>` demo. Replaced in-hub by the Crop tile (single image) and the Crop Studio overlay (one or many). Kept here to compare before deletion.",
      action: {
        kind: "openLink",
        label: "Open demo",
        href: "/image-editing/simple-crop",
        external: true,
      },
    },
  ];

  const expanded = expandedId
    ? (tools.find((t) => t.id === expandedId) ?? null)
    : null;

  return (
    <div className="h-full overflow-auto overscroll-contain p-3 md:p-4 space-y-4 md:space-y-5">
      {expanded?.expand ? (
        <section className="rounded-lg border border-primary/30 bg-card overflow-hidden">
          <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <expanded.icon className={cn("h-4 w-4", expanded.iconColor)} />
              {expanded.label}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpandedId(null)}
              aria-label="Close tool"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </header>
          <div className="p-2 md:p-3">{expanded.expand()}</div>
        </section>
      ) : null}

      <ToolGrid
        tools={tools}
        expandedId={expandedId}
        onAction={(tool) => handleToolAction(tool)}
      />

      <ToolGroupHeader
        label="Beta"
        description="Legacy and candidate-for-removal surfaces. Verify nothing essential is here before they're deleted from the tree."
      />
      <ToolGrid
        tools={betaTools}
        expandedId={expandedId}
        onAction={(tool) => handleToolAction(tool)}
      />
    </div>
  );

  function handleToolAction(tool: ToolDescriptor) {
    switch (tool.action.kind) {
      case "expand":
        setExpandedId((id) => (id === tool.id ? null : tool.id));
        break;
      case "openOverlay":
        dispatch(
          openOverlay({
            overlayId: tool.action.overlayId,
            instanceId: "default",
          }),
        );
        break;
      case "callback":
        void tool.action.run();
        break;
      case "openLink":
        // External links handled by the <Link> in the card itself.
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Group helpers — header label and a generic grid renderer.
// ---------------------------------------------------------------------------

function ToolGroupHeader({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="border-t border-border pt-4 space-y-1">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        {description}
      </p>
    </div>
  );
}

function ToolGrid({
  tools,
  expandedId,
  onAction,
}: {
  tools: ToolDescriptor[];
  expandedId: string | null;
  onAction: (tool: ToolDescriptor) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          isExpanded={expandedId === tool.id}
          onAction={() => onAction(tool)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool card — handles each action kind's affordance.
// ---------------------------------------------------------------------------

function ToolCard({
  tool,
  isExpanded,
  onAction,
}: {
  tool: ToolDescriptor;
  isExpanded: boolean;
  onAction: () => void;
}) {
  const Icon = tool.icon;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 flex flex-row md:flex-col items-start gap-3 md:gap-2",
        tool.beta
          ? "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10"
          : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 md:h-8 md:w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
          <Icon className={cn("h-4 w-4", tool.iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-semibold leading-tight">
              {tool.label}
            </h4>
            {tool.beta ? (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 leading-none">
                Beta
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2 md:line-clamp-none">
            {tool.description}
          </p>
          {tool.warning ? (
            <p className="mt-1.5 inline-flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{tool.warning}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="ml-auto md:ml-0 md:mt-auto md:pt-1 shrink-0">
        {tool.action.kind === "openLink" ? (
          <Link
            href={tool.action.href}
            target={tool.action.external ? "_blank" : undefined}
            rel={tool.action.external ? "noreferrer" : undefined}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {tool.action.label}
            {tool.action.external ? (
              <ExternalLink className="h-3 w-3 opacity-60" />
            ) : null}
          </Link>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={isExpanded ? "default" : "outline"}
            onClick={onAction}
            className="h-8 px-2 md:px-3"
          >
            {isExpanded && tool.action.kind === "expand"
              ? "Close"
              : tool.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Crop tool — composes the official `<ImageCropperWithSelect>`.
// On crop completion the result data URL is added to the selection so it
// flows through the rest of the hub.
// ---------------------------------------------------------------------------

function InlineCropTool() {
  const { addImage } = useSelectedImages();
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);

  const handleComplete = (url: string) => {
    setCroppedUrl(url);
    addImage({
      type: "local",
      url,
      id: `cropped:${Date.now()}`,
      metadata: {
        title: "Cropped image",
        description: "Crop output (in-memory data URL — save it to keep it).",
      },
    });
    toast.success("Crop added to selection — save it from the footer to keep.");
  };

  return (
    <div className="space-y-3">
      <ImageCropperWithSelect onComplete={handleComplete} />
      {croppedUrl ? (
        <div className="text-xs text-muted-foreground">
          Crop result added to your selection. To persist it, switch to the
          Upload tab and drop the data URL — or wire this tool to{" "}
          <Link
            href="/images/from-base64"
            className="text-primary hover:underline"
            target="_blank"
          >
            from-base64
          </Link>{" "}
          for a one-step save.
        </div>
      ) : null}
    </div>
  );
}
