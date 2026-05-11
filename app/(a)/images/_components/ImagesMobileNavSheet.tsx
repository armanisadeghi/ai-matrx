"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IMAGES_GROUP_LABELS,
  IMAGES_ROUTES,
  type ImagesGroup,
} from "./imagesRoutes";

const GROUP_ORDER: ImagesGroup[] = ["manager", "studio"];

export function ImagesMobileNavSheet({
  open,
  pathname,
  disabled,
  onClose,
  onNavigate,
}: {
  open: boolean;
  pathname: string;
  disabled: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
        aria-label="Close Images sections"
        onClick={onClose}
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
            onClick={onClose}
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
              disabled={disabled}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </section>
    </div>
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
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {route.label}
                </span>
                {route.isGroupLanding ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {IMAGES_GROUP_LABELS[group]} home
                  </span>
                ) : null}
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
