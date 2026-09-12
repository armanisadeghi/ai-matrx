"use client";

import { usePathname } from "next/navigation";
import { Atom, ImageIcon } from "lucide-react";
import { PlusTapButton, ZapTapButton } from "@ai-matrx/tap-target/buttons";
import { IMAGES_ROOT_PATH, findImagesRoute } from "./imagesRoutes";
import { RouteModeNav, type RouteNavItem } from "@/features/shell/components/header/RouteModeNav";

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

export function ImagesListHeader() {
  const pathname = usePathname();
  const activeRoute = findImagesRoute(pathname);
  const subpageTitle =
    pathname === IMAGES_ROOT_PATH ? "Home" : (activeRoute?.label ?? null);

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold leading-none text-foreground">
            Images
          </span>
          {subpageTitle ? (
            <span className="truncate text-[11px] font-medium leading-none text-muted-foreground">
              / {subpageTitle}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 px-2">
        <RouteModeNav items={IMAGE_MODE_ITEMS} />
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <ZapTapButton
          href="/images/studio"
          ariaLabel="Open Image Studio"
          label="Studio"
        />
        <PlusTapButton href="/images/upload" ariaLabel="Upload image" />
      </div>
    </div>
  );
}
