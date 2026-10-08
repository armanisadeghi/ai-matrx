"use client";

import { usePathname } from "next/navigation";
import { Atom, ImageIcon } from "lucide-react";
import { PlusTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import {
  IMAGES_ROOT_PATH,
  findImagesRoute,
} from "@/features/image-manager/components/imagesRoutes";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

const IMAGE_MODE_ITEMS: RouteNavItem[] = [
  {
    name: "Manager",
    href: "/images/manager",
    icon: ImageIcon,
    description: "Browse, organize, upload, and manage visual assets.",
  },
  {
    name: "Studio",
    href: "/images/studio",
    icon: Atom,
    description: "Create, edit, annotate, and transform images.",
  },
];

/**
 * The /images header on the shared RouteHeader: the title ellipsizes, the
 * Manager/Studio switch steps down (full → icons → menu) by the main column's
 * width, and Upload (the one action) stays — so the
 * row fits beside an open canvas instead of scrolling under its clip.
 */
export function ImagesListHeader() {
  const pathname = usePathname();
  const activeRoute = findImagesRoute(pathname);
  const subpageTitle =
    pathname === IMAGES_ROOT_PATH ? "Home" : (activeRoute?.label ?? null);

  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center gap-2 pl-1">
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold leading-none text-foreground">
            Images
            {subpageTitle ? (
              <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                / {subpageTitle}
              </span>
            ) : null}
          </span>
        </div>
      }
      center={<RouteModeNav items={IMAGE_MODE_ITEMS} />}
      // Studio is a mode in the nav — ONE control per choice (a second
      // "Studio" button here pushed the nav out of a narrow row).
      right={<PlusTapButton href="/images/upload" ariaLabel="Upload image" />}
    />
  );
}
