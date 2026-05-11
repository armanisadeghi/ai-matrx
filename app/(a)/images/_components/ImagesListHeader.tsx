"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImageIcon, Zap } from "lucide-react";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";
import { IMAGES_ROOT_PATH, findImagesRoute } from "./imagesRoutes";

export function ImagesListHeader() {
  const pathname = usePathname();
  const activeRoute = findImagesRoute(pathname);
  const subpageTitle =
    pathname === IMAGES_ROOT_PATH ? "Home" : (activeRoute?.label ?? null);

  return (
    <div className="flex w-full items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 flex-1 items-center gap-2">
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

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
          <Link href="/images/studio" aria-label="Open Image Studio">
            <Zap className="mr-1.5 h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">
              Studio
            </span>
          </Link>
        </Button>
        <Link href="/images/upload">
          <PlusTapButton ariaLabel="Upload image" />
        </Link>
      </div>
    </div>
  );
}
