"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import {
  IMAGES_GROUP_LABELS,
  IMAGES_ROOT_PATH,
  IMAGES_ROUTES,
  type ImagesGroup,
} from "./imagesRoutes";

interface ImagesSidebarMenuProps {
  expanded: boolean;
}
const GROUP_ORDER: ImagesGroup[] = ["manager", "studio"];

function GroupHeading({
  label,
  expanded,
}: {
  label: string;
  expanded: boolean;
}) {
  if (!expanded) return <div className="mx-2 my-1 border-t border-border/70" />;
  return (
    <div className="px-1.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </div>
  );
}

export default function ImagesSidebarMenu({
  expanded,
}: ImagesSidebarMenuProps) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
      <Link
        href={IMAGES_ROOT_PATH}
        title="Images Hub"
        aria-label="Images Hub"
        aria-current={pathname === IMAGES_ROOT_PATH ? "page" : undefined}
        className={cn(
          ROUTE_MENU_NAV_ITEM_CLASS,
          pathname === IMAGES_ROOT_PATH && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <ImageIcon
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label truncate">Images Hub</span>
      </Link>
      {GROUP_ORDER.map((group, index) => {
        const routes = IMAGES_ROUTES.filter((route) => route.group === group);
        return (
          <div key={group}>
            <GroupHeading
              label={IMAGES_GROUP_LABELS[group]}
              expanded={expanded}
            />
            {routes.map((route) => {
              const Icon = route.Icon;
              const isActive = pathname === route.path;
              return (
                <Link
                  key={route.path}
                  href={route.path}
                  title={route.label}
                  aria-label={route.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    ROUTE_MENU_NAV_ITEM_CLASS,
                    isActive && "shell-active-pill",
                    index > 0 && route.isGroupLanding && "mt-0.5",
                  )}
                >
                  <span className="shell-nav-icon">
                    <Icon
                      size={ROUTE_MENU_ICON_SIZE}
                      strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
                      className={route.iconColor}
                    />
                  </span>
                  <span className="shell-nav-label truncate">
                    {route.label}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
