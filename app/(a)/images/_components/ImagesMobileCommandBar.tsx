"use client";

import {
  ArrowRight,
  FolderPlus,
  Menu,
  Search,
  SlidersHorizontal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  OPEN_PUBLIC_SEARCH_FILTERS_EVENT,
  OPEN_UPLOAD_PICKER_EVENT,
} from "@/features/image-manager/mobileEvents";
import {
  IMAGES_ROOT_PATH,
  findImagesRoute,
} from "./imagesRoutes";

type PrimaryAction =
  | { type: "navigate"; label: string; path: string; Icon: LucideIcon }
  | { type: "event"; label: string; eventName: string; Icon: LucideIcon };

export function ImagesMobileCommandBar({
  pathname,
  onOpenSections,
}: {
  pathname: string;
  onOpenSections: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeRoute = useMemo(() => findImagesRoute(pathname), [pathname]);
  const currentLabel = activeRoute?.label ?? "Images";
  const CurrentIcon = activeRoute?.Icon ?? Search;
  const primaryAction = getPrimaryAction(pathname);
  const PrimaryIcon = primaryAction.Icon;

  const handleNavigate = (path: string) => {
    if (isPending || path === pathname) return;
    startTransition(() => router.push(path));
  };

  const handlePrimaryAction = () => {
    if (primaryAction.type === "navigate") {
      handleNavigate(primaryAction.path);
      return;
    }
    window.dispatchEvent(new CustomEvent(primaryAction.eventName));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pb-safe md:hidden">
      <div className="container mx-auto max-w-[1800px] px-3">
        <div className="flex items-center gap-2 rounded-full p-2 shell-glass-dock">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenSections}
            className="relative h-10 w-10 shrink-0 rounded-full shell-glass"
            aria-label="Open Images sections"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <button
            type="button"
            onClick={onOpenSections}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left shell-glass active:scale-[0.99]"
            aria-label={`Current Images section: ${currentLabel}`}
          >
            <CurrentIcon className="h-4 w-4 shrink-0 text-glass-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-glass-foreground">
              {getCenterLabel(pathname, currentLabel)}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          <Button
            type="button"
            size="icon"
            onClick={handlePrimaryAction}
            disabled={
              isPending &&
              primaryAction.type === "navigate" &&
              primaryAction.path !== pathname
            }
            className="h-10 w-10 shrink-0 rounded-full shell-glass bg-primary hover:bg-primary/90"
            aria-label={primaryAction.label}
          >
            <PrimaryIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getCenterLabel(pathname: string, currentLabel: string) {
  if (pathname === IMAGES_ROOT_PATH) return "Search images...";
  if (pathname === "/images/public-search") return "Search public images...";
  if (pathname === "/images/all-files") return "All image files";
  if (pathname === "/images/my-cloud") return "My image cloud";
  if (pathname === "/images/upload") return "Upload image";
  return currentLabel;
}

function getPrimaryAction(pathname: string): PrimaryAction {
  if (pathname === "/images/upload") {
    return {
      type: "event",
      label: "Browse images to upload",
      eventName: OPEN_UPLOAD_PICKER_EVENT,
      Icon: Upload,
    };
  }
  if (pathname === "/images/all-files") {
    return {
      type: "navigate",
      label: "Upload image",
      path: "/images/upload",
      Icon: FolderPlus,
    };
  }
  if (pathname === "/images/public-search") {
    return {
      type: "event",
      label: "Adjust public image filters",
      eventName: OPEN_PUBLIC_SEARCH_FILTERS_EVENT,
      Icon: SlidersHorizontal,
    };
  }
  return {
    type: "navigate",
    label: "Upload image",
    path: "/images/upload",
    Icon: Upload,
  };
}
