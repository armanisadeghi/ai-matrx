"use client";

import {
  FolderPlus,
  ImageIcon,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  SlidersHorizontal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OPEN_PUBLIC_SEARCH_FILTERS_EVENT,
  OPEN_UPLOAD_PICKER_EVENT,
} from "@/features/image-manager/mobileEvents";

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
      <div className="container mx-auto max-w-[1800px] px-2">
        <div className="relative rounded-[1.35rem] border border-border/70 bg-card/90 px-3 py-2 pr-16 shadow-[0_-8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl">
          <div className="grid h-10 grid-cols-6 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSections}
              className="h-10 w-10 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Open Images sections"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>

            {APP_QUICK_ACTIONS.map((item) => (
              <QuickActionButton
                key={item.path}
                label={item.label}
                path={item.path}
                Icon={item.Icon}
                active={item.isActive(pathname)}
                disabled={isPending}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

          <Button
            type="button"
            size="icon"
            onClick={handlePrimaryAction}
            disabled={
              isPending &&
              primaryAction.type === "navigate" &&
              primaryAction.path !== pathname
            }
            className="absolute bottom-3 right-3 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95"
            aria-label={primaryAction.label}
          >
            <PrimaryIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
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

function QuickActionButton({
  label,
  path,
  Icon,
  active,
  disabled,
  onNavigate,
}: {
  label: string;
  path: string;
  Icon: LucideIcon;
  active: boolean;
  disabled: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(path)}
      disabled={disabled}
      className={cn(
        "mx-auto flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:scale-95 disabled:opacity-50",
        active
          ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/45 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.18)]"
          : "hover:bg-accent hover:text-foreground",
      )}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

const APP_QUICK_ACTIONS: Array<{
  label: string;
  path: string;
  Icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}> = [
  {
    label: "Agents",
    path: "/agents",
    Icon: LayoutGrid,
    isActive: (pathname) => pathname.startsWith("/agents"),
  },
  {
    label: "Chat",
    path: "/chat",
    Icon: MessageCircle,
    isActive: (pathname) => pathname.startsWith("/chat"),
  },
  {
    label: "Notes",
    path: "/notes",
    Icon: NotebookPen,
    isActive: (pathname) => pathname.startsWith("/notes"),
  },
  {
    label: "Tasks",
    path: "/tasks",
    Icon: ListChecks,
    isActive: (pathname) => pathname.startsWith("/tasks"),
  },
  {
    label: "Images",
    path: "/images",
    Icon: ImageIcon,
    isActive: (pathname) => pathname.startsWith("/images"),
  },
];
