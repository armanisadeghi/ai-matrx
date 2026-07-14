"use client";

// EntityModeHeader — the AGENTS-PATTERN header as a drop-in template.
// One call gives an [id]-style route the full gold standard:
//
//   left:   glass back chevron + the entity's name as a SIBLING DROPDOWN
//           (like /agents/[id] — never a static title, never a giant h1)
//   center: RouteModeNav (View | Edit | …) — measurement-collapsing pill
//   right:  contextual tap-target actions (pass *TapButton components)
//
//   <EntityModeHeader
//     backHref="/schedules"
//     entityLabel={task.title}
//     entityOptions={tasks.map((t) => ({
//       label: t.title, href: `/schedules/${t.id}`, active: t.id === task.id,
//     }))}
//     modes={[
//       { name: "View", href: `/schedules/${task.id}`, icon: Eye },
//       { name: "Edit", href: `/schedules/${task.id}/edit`, icon: Pencil },
//     ]}
//     right={<PlayTapButton … />}
//   />
//
// Reference implementations: /schedules/[id] (this template),
// /agents/[id]/build (the hand-rolled original), /cms/[siteId] (site switcher).

import Link from "next/link";
import { ChevronDown, Check } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface EntityOption {
  label: string;
  href: string;
  active?: boolean;
}

export interface EntityModeHeaderProps {
  /** Back tap-target destination (the family's list page). */
  backHref: string;
  /** Current entity's name — rendered small, in the top row, never as an h1. */
  entityLabel: string;
  /** Sibling entities for the name dropdown. Omit for a plain label. */
  entityOptions?: EntityOption[];
  /** Sub-view nav (View | Edit | …). Omit for single-view entities. */
  modes?: RouteNavItem[];
  /** Right-slot tap-target actions. */
  right?: React.ReactNode;
}

export function EntityModeHeader({
  backHref,
  entityLabel,
  entityOptions,
  modes,
  right,
}: EntityModeHeaderProps) {
  const label = (
    <span className="truncate max-w-[100px] sm:max-w-[180px] text-sm font-medium text-foreground">
      {entityLabel}
    </span>
  );

  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton href={backHref} ariaLabel="Back" />
          {entityOptions && entityOptions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Switch"
                  className="flex items-center gap-1 min-w-0 rounded-full px-2 py-1 hover:bg-[var(--matrx-glass-bg-active)] transition-colors"
                >
                  {label}
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="max-h-[60vh] overflow-y-auto">
                  {entityOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.href}
                      asChild
                      className={cn(opt.active && "bg-accent/60")}
                    >
                      <Link href={opt.href} className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            opt.active
                              ? "opacity-100 text-primary"
                              : "opacity-0",
                          )}
                        />
                        <span className="truncate">{opt.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="ml-2 flex min-w-0 items-center">{label}</span>
          )}
        </>
      }
      center={
        modes && modes.length > 0 ? <RouteModeNav items={modes} /> : undefined
      }
      right={right}
    />
  );
}
