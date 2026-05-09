"use client";

/**
 * Shared sidebar for every `/images/*` route.
 *
 * Active item driven entirely by `usePathname()` — no client state, no
 * localStorage for "active." The only persisted bit is the collapsed flag
 * (key: `images:sidebar-collapsed`).
 *
 * Mobile (`useIsMobile()`): sidebar becomes an Agents-style bottom action
 * bar. Navigation lives in a bottom sheet grouped by Manager and Studio.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ImageIcon,
  PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  IMAGES_GROUP_LABELS,
  IMAGES_ROOT_PATH,
  IMAGES_ROUTES,
  type ImagesGroup,
  type ImagesRoute,
} from "./imagesRoutes";
import { ImagesMobileCommandBar } from "./ImagesMobileCommandBar";
import { ImagesMobileNavSheet } from "./ImagesMobileNavSheet";

const STORAGE_KEY_COLLAPSED = "images:sidebar-collapsed";

const GROUP_ORDER: ImagesGroup[] = ["manager", "studio"];

export function ImagesSidebar() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_COLLAPSED);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_COLLAPSED, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (isMobile) {
    return <ImagesMobileChrome pathname={pathname} />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex-shrink-0 border-r border-border bg-card/40 flex flex-col transition-[width] duration-200 h-full",
          collapsed ? "w-11" : "w-44",
        )}
      >
        <SidebarHeader
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <nav
          className="flex-1 overflow-y-auto py-1"
          aria-label="Images sections"
        >
          {GROUP_ORDER.map((group, idx) => (
            <GroupBlock
              key={group}
              group={group}
              pathname={pathname}
              collapsed={collapsed}
              dense
              showDivider={idx > 0}
            />
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}

function ImagesMobileChrome({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navigate = (path: string) => {
    if (isPending || path === pathname) return;
    startTransition(() => router.push(path));
  };

  return (
    <>
      <ImagesMobileCommandBar
        pathname={pathname}
        onOpenSections={() => setOpen(true)}
      />
      <ImagesMobileNavSheet
        open={open}
        pathname={pathname}
        disabled={isPending}
        onClose={() => setOpen(false)}
        onNavigate={navigate}
      />
    </>
  );
}

function SidebarHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <div className="px-1 py-1.5 border-b border-border flex items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-primary/10 transition-colors"
            >
              <ImageIcon className="h-4 w-4 text-primary" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            Expand sidebar
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2">
      <Link
        href={IMAGES_ROOT_PATH}
        className="text-sm font-semibold text-foreground flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
      >
        <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="truncate">Images</span>
      </Link>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            aria-expanded={true}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          Collapse sidebar
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function GroupBlock({
  group,
  pathname,
  collapsed,
  dense,
  showDivider,
}: {
  group: ImagesGroup;
  pathname: string;
  collapsed: boolean;
  dense: boolean;
  showDivider: boolean;
}) {
  const items = IMAGES_ROUTES.filter((r) => r.group === group);
  if (items.length === 0) return null;

  return (
    <>
      {showDivider ? (
        <div
          className={cn(
            "mt-2 mb-1 border-t border-border",
            collapsed ? "mx-1.5 pt-1.5" : dense ? "mx-2.5 pt-1.5" : "mx-3 pt-2",
          )}
          aria-hidden
        />
      ) : null}
      {!collapsed ? (
        <div
          className={cn(
            "px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium",
            dense ? "px-2.5" : "px-3",
          )}
        >
          {IMAGES_GROUP_LABELS[group]}
        </div>
      ) : null}
      {items.map((route) => (
        <NavItem
          key={route.path}
          route={route}
          isActive={pathname === route.path}
          dense={dense}
          collapsed={collapsed}
        />
      ))}
    </>
  );
}

function NavItem({
  route,
  isActive,
  dense,
  collapsed,
}: {
  route: ImagesRoute;
  isActive: boolean;
  dense: boolean;
  collapsed: boolean;
}) {
  const Icon = route.Icon;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={route.path}
            aria-current={isActive ? "page" : undefined}
            aria-label={route.label}
            className={cn(
              "mx-1 my-0.5 h-8 w-8 rounded-md flex items-center justify-center transition-colors",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-foreground hover:bg-accent/60",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                isActive ? "text-primary" : route.iconColor,
              )}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          {route.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={route.path}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "w-full flex items-center gap-2 text-left transition-colors border-l-2",
        dense ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
        route.isGroupLanding && !isActive && "font-medium",
        isActive
          ? "bg-primary/10 text-primary border-l-primary font-medium"
          : "border-l-transparent text-foreground hover:bg-accent/50",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          dense ? "h-3.5 w-3.5" : "h-4 w-4",
          isActive ? "text-primary" : route.iconColor,
        )}
      />
      <span className="truncate">{route.label}</span>
    </Link>
  );
}
