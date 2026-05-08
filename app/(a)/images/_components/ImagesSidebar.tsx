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

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ImageIcon,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  findImagesRoute,
  type ImagesGroup,
  type ImagesRoute,
} from "./imagesRoutes";

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

  const activeRoute = useMemo(() => findImagesRoute(pathname), [pathname]);
  const currentLabel = activeRoute?.label ?? "Images";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navigate = (path: string) => {
    if (isPending || path === pathname) return;
    startTransition(() => router.push(path));
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 pb-safe md:hidden">
        <div className="container mx-auto max-w-[1800px] px-4">
          <div className="flex items-center gap-2 rounded-full p-2 shell-glass-dock">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              className="relative h-10 w-10 shrink-0 rounded-full shell-glass"
              aria-label="Open Images sections"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left shell-glass active:scale-[0.99]"
              aria-label={`Current Images section: ${currentLabel}`}
            >
              <Search className="h-4 w-4 shrink-0 text-glass-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-glass-foreground">
                {currentLabel}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>

            <Button
              type="button"
              size="icon"
              onClick={() => navigate("/images/upload")}
              disabled={isPending || pathname === "/images/upload"}
              className="h-10 w-10 shrink-0 rounded-full shell-glass bg-primary hover:bg-primary/90"
              aria-label="Upload image"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
            aria-label="Close Images sections"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Images sections"
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl"
          >
            <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted-foreground/35" />
            <div className="flex min-h-[48px] items-center px-3 pb-2 pt-1">
              <div className="min-w-[44px]" />
              <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">
                Images
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] min-w-[44px] px-1 text-[15px] text-primary active:opacity-70"
              >
                Done
              </button>
            </div>
            <nav
              className="max-h-[calc(82dvh-4rem)] space-y-5 overflow-y-auto overscroll-contain px-3 pb-safe"
              aria-label="Images sections"
            >
              {GROUP_ORDER.map((group) => (
                <MobileGroup
                  key={group}
                  group={group}
                  pathname={pathname}
                  disabled={isPending}
                  onNavigate={navigate}
                />
              ))}
            </nav>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MobileGroup({
  group,
  pathname,
  disabled,
  onNavigate,
}: {
  group: ImagesGroup;
  pathname: string;
  disabled: boolean;
  onNavigate: (path: string) => void;
}) {
  const items = IMAGES_ROUTES.filter((route) => route.group === group);
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {IMAGES_GROUP_LABELS[group]}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/45">
        {items.map((route, index) => {
          const Icon = route.Icon;
          const isActive = pathname === route.path;
          return (
            <button
              key={route.path}
              type="button"
              onClick={() => onNavigate(route.path)}
              disabled={disabled || isActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] w-full items-center gap-3 px-3 text-left transition-colors",
                index > 0 && "border-t border-border/70",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground active:bg-muted/70",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-primary" : route.iconColor,
                  )}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {route.label}
              </span>
              {isActive ? (
                <span className="text-xs text-primary">Current</span>
              ) : (
                <ArrowRight className="h-4 w-4 text-muted-foreground/70" />
              )}
            </button>
          );
        })}
      </div>
    </section>
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
