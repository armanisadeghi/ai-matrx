"use client";

import { usePathname } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { PlusTapButton, ZapTapButton } from "@/components/icons/tap-buttons";
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
