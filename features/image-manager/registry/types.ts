/**
 * features/image-manager/registry/types.ts
 *
 * Shared section-registry types for the Image Manager hub.
 *
 * The registry has one consumer in this app: the legacy modal
 * (`<ImageManager>`) used as a picker. The unified `/images/*` route tree
 * does NOT use this registry — each route there imports its tab component
 * directly. Adding a tab to the modal is still a single-line entry.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AllowedFileKind } from "@/components/image/cloud/CloudFilesTab";
import type { Visibility } from "@/features/files/types";
import type { EmbeddedImageStudioProps } from "@/features/image-studio/components/EmbeddedImageStudio";

export type SectionGroup = "primary" | "tools";

export interface SectionDefinition {
  /** Stable id used for `initialTab`, persistence, deep-links. */
  id: string;
  /** Sidebar label (also used as Tab label in the modal). */
  label: string;
  /** Lucide icon for sidebar / placeholder hero. */
  icon: LucideIcon;
  /** Tailwind text-color class — gives the sidebar visual lift. */
  iconColor: string;
  /**
   * Optional one-line description shown in tools-group expanded card.
   * Primary-group sections do NOT show descriptions in the sidebar.
   */
  hint?: string;
  /** "primary" appears in the main sidebar; "tools" lives in the secondary group. */
  group: SectionGroup;
  /** Marks placeholder/coming-soon sections — the modal can hide them. */
  placeholder?: boolean;
  /** Contracted body renderer — can call hooks since it's invoked inside React. */
  render: () => ReactNode;
}

/**
 * Context passed to `buildImageManagerSections`. Every field is optional so
 * the route can call `buildImageManagerSections({ variant: "route" })` and
 * the modal can pass its legacy props in.
 */
export interface SectionContext {
  variant: "route" | "modal";

  // ─── Public Images / Search ────────────────────────────────────────────
  /** Initial Unsplash query passed to the Public Images gallery. */
  initialSearchTerm?: string;

  // ─── Your Cloud / All Files ────────────────────────────────────────────
  /**
   * Legacy: pre-cloud URLs rendered as a "Provided" row inside Your Cloud.
   * Kept for back-compat with old callers of `<ImageManager userImages={…}>`.
   */
  userImages?: string[];

  /** Which file kinds are selectable in the All Files tab. Default `["image"]`. */
  allowFileTypes?: AllowedFileKind[];

  // ─── Upload tab ────────────────────────────────────────────────────────
  /** Logical folder path for new uploads. Default: `"Images/Uploads"`. */
  defaultUploadFolderPath?: string;
  /** Pre-resolved upload-destination folder id. */
  defaultUploadFolderId?: string | null;
  /** Default visibility for new uploads. */
  defaultVisibility?: Visibility;
  /** MIME types accepted by the Upload tab dropzone. */
  acceptMimes?: string[];

  // ─── Image Studio ──────────────────────────────────────────────────────
  imageStudioProps?: Partial<EmbeddedImageStudioProps>;

  // ─── Section visibility flags (modal-only by default) ──────────────────
  /** Show the Image Studio tab. Default `true`. */
  showImageStudio?: boolean;
  /** Show the AI Generate placeholder. Default `true`. */
  showAIGenerate?: boolean;
  /** Show the secondary "tools" group (Phase 3+). Default `true` for route, `false` for modal. */
  showTools?: boolean;

  /**
   * Selection mode hint. The modal historically hides Image Studio when
   * `selectionMode === "none"`. The route ignores this — its mode toggle
   * lives in the sidebar footer.
   */
  selectionMode?: "single" | "multiple" | "none";
}
