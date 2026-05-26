import {
  Atom,
  Braces,
  Cloud,
  FileImage,
  FolderTree,
  ImageIcon,
  Layers,
  Library,
  Pencil,
  Zap,
  Stamp,
  Upload,
  UserCircle,
  Wrench,
  type LucideIcon
} from "lucide-react";

/**
 * Single source of truth for every `/images/*` route.
 *
 * Consumed by:
 *   - <ImagesSidebar/> (active-route detection, nav rendering)
 *   - Group landings (manager / studio) that render their own children
 *
 * Group order is render order. Within a group, the landing entry comes first.
 */

export type ImagesGroup = "manager" | "studio";

export interface ImagesRoute {
  /** Absolute pathname, used for `usePathname()` matching and `<Link href>`. */
  path: string;
  /** Short label rendered in the sidebar. */
  label: string;
  /** Lucide icon shown in the sidebar. */
  Icon: LucideIcon;
  /** Tailwind colour class for the icon — copied from the legacy registries. */
  iconColor: string;
  /** Sidebar group. */
  group: ImagesGroup;
  /** True if this is the group's landing entry (first item, slightly emphasised). */
  isGroupLanding?: boolean;
}

export const IMAGES_ROOT_PATH = "/images";

export const IMAGES_ROUTES: readonly ImagesRoute[] = [
  // ── Manager group ────────────────────────────────────────────────────
  {
    path: "/images/manager",
    label: "Manager",
    Icon: ImageIcon,
    iconColor: "text-primary",
    group: "manager",
    isGroupLanding: true,
  },
  {
    path: "/images/public-search",
    label: "Public Search",
    Icon: ImageIcon,
    iconColor: "text-sky-500",
    group: "manager",
  },
  {
    path: "/images/my-cloud",
    label: "My Cloud",
    Icon: Cloud,
    iconColor: "text-violet-500",
    group: "manager",
  },
  {
    path: "/images/all-files",
    label: "All Files",
    Icon: FolderTree,
    iconColor: "text-amber-500",
    group: "manager",
  },
  {
    path: "/images/upload",
    label: "Upload",
    Icon: Upload,
    iconColor: "text-emerald-500",
    group: "manager",
  },
  {
    path: "/images/branded",
    label: "Branded",
    Icon: Stamp,
    iconColor: "text-orange-500",
    group: "manager",
  },
  {
    path: "/images/tools",
    label: "Tools",
    Icon: Wrench,
    iconColor: "text-zinc-500",
    group: "manager",
  },

  // ── Studio group ─────────────────────────────────────────────────────
  {
    path: "/images/studio",
    label: "Studio",
    Icon: Atom,
    iconColor: "text-fuchsia-500",
    group: "studio",
    isGroupLanding: true,
  },
  {
    path: "/images/studio-light",
    label: "Studio Light",
    Icon: Zap,
    iconColor: "text-fuchsia-400",
    group: "studio",
  },
  {
    path: "/images/studio-library",
    label: "Studio Library",
    Icon: Library,
    iconColor: "text-pink-500",
    group: "studio",
  },
  {
    path: "/images/ai-generate",
    label: "AI Generate",
    Icon: Zap,
    iconColor: "text-rose-500",
    group: "studio",
  },
  {
    path: "/images/generate",
    label: "Generate",
    Icon: Zap,
    iconColor: "text-violet-400",
    group: "studio",
  },
  {
    path: "/images/edit",
    label: "Edit",
    Icon: Zap,
    iconColor: "text-amber-400",
    group: "studio",
  },
  {
    path: "/images/annotate",
    label: "Annotate",
    Icon: Pencil,
    iconColor: "text-blue-500",
    group: "studio",
  },
  {
    path: "/images/avatar",
    label: "Avatar",
    Icon: UserCircle,
    iconColor: "text-teal-500",
    group: "studio",
  },
  {
    path: "/images/convert",
    label: "Convert",
    Icon: FileImage,
    iconColor: "text-indigo-500",
    group: "studio",
  },
  {
    path: "/images/from-base64",
    label: "Base64",
    Icon: Braces,
    iconColor: "text-lime-500",
    group: "studio",
  },
  {
    path: "/images/presets",
    label: "Presets",
    Icon: Layers,
    iconColor: "text-purple-500",
    group: "studio",
  },
  {
    path: "/images/library",
    label: "Library",
    Icon: Library,
    iconColor: "text-pink-400",
    group: "studio",
  },
] as const;

export function findImagesRoute(pathname: string): ImagesRoute | null {
  return IMAGES_ROUTES.find((r) => r.path === pathname) ?? null;
}

export const IMAGES_GROUP_LABELS: Record<ImagesGroup, string> = {
  manager: "Manager",
  studio: "Studio",
};
