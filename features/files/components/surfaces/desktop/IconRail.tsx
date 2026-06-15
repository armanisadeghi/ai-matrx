/**
 * features/files/components/surfaces/dropbox/IconRail.tsx
 *
 * The COLLAPSED form of the secondary nav sidebar — a slim icon-only rail.
 * It is rendered only while the folders sidebar is collapsed; expanding the
 * sidebar replaces it with the full `NavSidebar`. Anchors: Home (all files),
 * Folders (tree view), Activity (placeholder).
 *
 * The top button expands the sidebar back to its full width.
 */

"use client";

import Link from "next/link";
import { Activity, FolderTree, Home, PanelLeftOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";
import type { CloudFilesSection } from "./section";

export interface IconRailProps {
  section: CloudFilesSection;
  /** Expand the sidebar back to its full width. */
  onExpand?: () => void;
  className?: string;
}

interface RailItem {
  key: CloudFilesSection | "more";
  href?: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const ITEMS: RailItem[] = [
  { key: "all", href: "/files", label: "Home", icon: Home },
  {
    key: "folders",
    href: "/files/folders",
    label: "Folders",
    icon: FolderTree,
  },
  {
    key: "activity",
    href: "/files/activity",
    label: "Activity",
    icon: Activity,
  },
];

export function IconRail({ section, onExpand, className }: IconRailProps) {
  return (
    <nav
      aria-label="Cloud files primary"
      className={cn(
        "flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-border/70 bg-muted/20 py-3",
        className,
      )}
    >
      {onExpand && (
        <TooltipIcon label="Expand sidebar" side="right">
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={onExpand}
            className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
          </button>
        </TooltipIcon>
      )}
      {ITEMS.map((item) => {
        const active =
          item.key === section ||
          (item.key === "all" && section === "folders-root");
        const Icon = item.icon;
        const tooltipLabel = item.disabled
          ? `${item.label} (coming soon)`
          : item.label;
        const content = (
          <span
            aria-label={item.label}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition",
              "hover:bg-accent hover:text-foreground",
              active && "bg-primary/10 text-primary ring-1 ring-primary/20",
              item.disabled && "pointer-events-none opacity-40",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">{item.label}</span>
          </span>
        );
        const inner =
          item.href && !item.disabled ? (
            <Link href={item.href}>{content}</Link>
          ) : (
            <div>{content}</div>
          );
        return (
          <TooltipIcon key={item.key} label={tooltipLabel} side="right">
            {inner}
          </TooltipIcon>
        );
      })}
    </nav>
  );
}
