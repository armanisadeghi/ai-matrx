/**
 * features/image-manager/registry/sections.ts
 *
 * Single source of truth for the Image Manager hub's section list.
 *
 * Both the legacy modal (`<ImageManager>`) and the route shell
 * (`<ImageManagerPageShell>`) call `buildImageManagerSections(ctx)` and
 * render the resulting `SectionDefinition[]` in their own way.
 *
 * To add a new section:
 *   1. Append an entry to `PRIMARY_SECTIONS` or `TOOL_SECTIONS` below
 *      (whichever group fits).
 *   2. Done. The route picks it up in the sidebar; the modal picks it up
 *      as a tab.
 */

import React from "react";
import {
  Atom,
  Cloud,
  FolderTree,
  ImageIcon,
  Library,
  Zap,
  Stamp,
  Upload,
  User,
  Wrench
} from "lucide-react";

import { CloudImagesTab } from "@/components/image/cloud/CloudImagesTab";
import { CloudFilesTab } from "@/components/image/cloud/CloudFilesTab";
import { CloudUploadTab } from "@/components/image/cloud/CloudUploadTab";
import { ImageStudioTab } from "@/components/image/cloud/ImageStudioTab";

import type { SectionContext, SectionDefinition } from "./types";
import { AIGenerateHero } from "../components/AIGenerateHero";
import { PublicImagesSection } from "../components/PublicImagesSection";
import { BrandedUploadTab } from "../components/BrandedUploadTab";
import { StudioLibraryTab } from "../components/StudioLibraryTab";
import { ProfilePhotoTab } from "../components/ProfilePhotoTab";
import { ToolsTab } from "../components/ToolsTab";
import { FullImageStudioTab } from "../components/FullImageStudioTab";

// ---------------------------------------------------------------------------
// Stable section ids live in `./ids.ts` (a leaf module with zero imports) so
// `ImageManager.tsx` — which is transitively imported by some tab components
// here — can read them without forming a circular dependency. Re-exported
// from this module for backwards-compat with existing callers.
// ---------------------------------------------------------------------------

export { SECTION_IDS } from "./ids";
export type { SectionId } from "./ids";

import { SECTION_IDS } from "./ids";

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the Image Manager section list.
 *
 * Honors the same flags the modal historically used:
 * - `showImageStudio` (default `true`) — modal hides studio in `selectionMode === "none"`.
 * - `showAIGenerate` (default `true`).
 * - `showTools` (default `true` for route, `false` for modal).
 */
export function buildImageManagerSections(
  ctx: SectionContext,
): SectionDefinition[] {
  const showImageStudio =
    ctx.showImageStudio !== false && ctx.selectionMode !== "none";
  const showAIGenerate = ctx.showAIGenerate !== false;

  const primary: SectionDefinition[] = [
    {
      id: SECTION_IDS.publicSearch,
      label: "Public Images",
      icon: ImageIcon,
      iconColor: "text-sky-500",
      group: "primary",
      hint: "Curated covers and Unsplash search.",
      render: () =>
        React.createElement(PublicImagesSection, {
          initialSearchTerm: ctx.initialSearchTerm,
        }),
    },
    {
      id: SECTION_IDS.myImages,
      label: "Your Cloud",
      icon: Cloud,
      iconColor: "text-violet-500",
      group: "primary",
      hint: "Image-filtered view of your cloud library.",
      render: () =>
        React.createElement(CloudImagesTab, {
          providedUrls:
            ctx.userImages && ctx.userImages.length > 0
              ? ctx.userImages
              : undefined,
        }),
    },
    {
      id: SECTION_IDS.myFiles,
      label: "All Files",
      icon: FolderTree,
      iconColor: "text-amber-500",
      group: "primary",
      hint: "Full cloud-files browser (folders + non-image files).",
      render: () =>
        React.createElement(CloudFilesTab, {
          allowFileTypes: ctx.allowFileTypes ?? ["image"],
        }),
    },
    {
      id: SECTION_IDS.upload,
      label: "Upload",
      icon: Upload,
      iconColor: "text-emerald-500",
      group: "primary",
      hint: "Drag, drop, paste or pick — saves to your cloud.",
      render: () =>
        React.createElement(CloudUploadTab, {
          defaultUploadFolderPath: ctx.defaultUploadFolderPath,
          defaultUploadFolderId: ctx.defaultUploadFolderId,
          visibility: ctx.defaultVisibility,
          accept: ctx.acceptMimes,
        }),
    },
    {
      id: SECTION_IDS.brandedUpload,
      label: "Branded",
      icon: Stamp,
      iconColor: "text-orange-500",
      group: "primary",
      hint: "Generate cover / OG / thumb / favicon variants from one image.",
      render: () => React.createElement(BrandedUploadTab),
    },
  ];

  if (showImageStudio) {
    // The full three-column shell — same component that powers
    // /images/convert. Embedded so users never have to leave the hub.
    primary.push({
      id: SECTION_IDS.studioFull,
      label: "Image Studio",
      icon: Atom,
      iconColor: "text-fuchsia-500",
      group: "primary",
      hint: "Full preset catalog + multi-file conversion shell.",
      render: () => React.createElement(FullImageStudioTab),
    });
    // The lighter, picker-tuned studio (`<EmbeddedImageStudio>`). Kept
    // because it returns directly to `SelectedImagesProvider`, which the
    // full shell does not — callers using the hub as a picker still want it.
    primary.push({
      id: SECTION_IDS.imageStudio,
      label: "Studio Light",
      icon: Zap,
      iconColor: "text-fuchsia-400",
      group: "primary",
      hint: "Compact crop + variant flow, returns straight to your selection.",
      render: () =>
        React.createElement(ImageStudioTab, {
          imageStudioProps: ctx.imageStudioProps,
        }),
    });
    primary.push({
      id: SECTION_IDS.studioLibrary,
      label: "Studio Library",
      icon: Library,
      iconColor: "text-pink-500",
      group: "primary",
      hint: "Read-only view of every Studio save.",
      render: () => React.createElement(StudioLibraryTab),
    });
  }

  if (showAIGenerate) {
    primary.push({
      id: SECTION_IDS.aiGenerate,
      label: "AI Generate",
      icon: Zap,
      iconColor: "text-rose-500",
      group: "primary",
      hint: "Describe an image and generate it.",
      placeholder: true,
      render: () => React.createElement(AIGenerateHero),
    });
  }

  // Profile photo lives in primary because it's a high-intent action,
  // even if visited rarely. Both the route and the modal show it.
  primary.push({
    id: SECTION_IDS.profilePhoto,
    label: "Profile Photo",
    icon: User,
    iconColor: "text-cyan-500",
    group: "primary",
    hint: "Upload an avatar — saves directly to your profile.",
    render: () => React.createElement(ProfilePhotoTab),
  });

  // Secondary "tools" group — single landing tile that hosts every minor
  // image utility. Keeps the sidebar tight while still giving each utility
  // a discoverable home. Hidden from the modal historically (it surfaces
  // only the primary tabs), shown in the route shell.
  const tools: SectionDefinition[] = [
    {
      id: SECTION_IDS.tools,
      label: "Tools",
      icon: Wrench,
      iconColor: "text-zinc-500",
      group: "tools",
      hint: "Crop, Lightbox, Floating Gallery, Screenshot, and more.",
      render: () => React.createElement(ToolsTab),
    },
  ];

  return [...primary, ...(ctx.showTools !== false ? tools : [])];
}
