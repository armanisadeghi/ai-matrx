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
  type LucideIcon,
} from "lucide-react";

/** Shared route registry for the Images module. It lives outside app route
 * groups because the shell is built for every deployment profile. */
export type ImagesGroup = "manager" | "studio";

export interface ImagesRoute {
  path: string;
  label: string;
  Icon: LucideIcon;
  iconColor: string;
  group: ImagesGroup;
  isGroupLanding?: boolean;
  requiresAuthentication?: boolean;
}

export const IMAGES_ROOT_PATH = "/images";

export const IMAGES_ROUTES: readonly ImagesRoute[] = [
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
    requiresAuthentication: true,
  },
  {
    path: "/images/all-files",
    label: "All Files",
    Icon: FolderTree,
    iconColor: "text-amber-500",
    group: "manager",
    requiresAuthentication: true,
  },
  {
    path: "/images/upload",
    label: "Upload",
    Icon: Upload,
    iconColor: "text-emerald-500",
    group: "manager",
    requiresAuthentication: true,
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
  return IMAGES_ROUTES.find((route) => route.path === pathname) ?? null;
}

export const IMAGES_GROUP_LABELS: Record<ImagesGroup, string> = {
  manager: "Manager",
  studio: "Studio",
};
