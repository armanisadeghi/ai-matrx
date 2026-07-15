"use client";

// EntityModeHeader — the AGENTS-PATTERN header as a drop-in template.
//
// Desktop (sm+):  back | entity-name sibling dropdown | RouteModeNav pill | actions
// Mobile  (<sm):  back | entity-name dropdown | ONE "…" tap target → bottom
//                 drawer holding the modes AND the actions. Never cram the
//                 phone header — few things up top, everything else in the sheet.
//
// Actions are DECLARATIVE so the same list renders as glass tap targets on
// desktop and drawer rows on mobile. `primary` renders solid primary,
// `destructive` renders solid bg-destructive (per /demos/button-demo).
// Tap targets carry their own 44px geometry — never wrap them in gap/padding.
//
// Reference consumer: /schedules/[id] (features/scheduling/components/detail/
// ScheduleDetail.tsx). The hand-rolled original: /agents/[id]/build.

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface EntityOption {
  label: string;
  href: string;
  active?: boolean;
}

export interface EntityHeaderAction {
  label: string;
  icon: LucideIcon;
  onPress?: () => void;
  href?: string;
  /** Solid primary pill — the ONE main action of the page. */
  primary?: boolean;
  /** Solid destructive pill (delete/remove). */
  destructive?: boolean;
  disabled?: boolean;
}

export interface EntityModeHeaderProps {
  /** Back tap-target destination (the family's list page). */
  backHref: string;
  /** Current entity's name — small, in the top row, never an h1. */
  entityLabel: string;
  /** Sibling entities for the name dropdown. Omit for a plain label. */
  entityOptions?: EntityOption[];
  /** Sub-view nav (View | Edit | …). Center pill on desktop; drawer rows on mobile. */
  modes?: RouteNavItem[];
  /** Declarative actions — glass tap targets on desktop, drawer rows on mobile. */
  actions?: EntityHeaderAction[];
  /** Desktop-only extra controls (e.g. a Switch). Hidden below sm. */
  right?: React.ReactNode;
}

function DesktopAction({ action }: { action: EntityHeaderAction }) {
  const Icon = action.icon;
  const shared = {
    icon: <Icon className="h-4 w-4" />,
    ariaLabel: action.label,
    onClick: action.onPress,
    href: action.href,
    disabled: action.disabled,
  };
  if (action.destructive) {
    return (
      <TapTargetButtonSolid
        {...shared}
        bgColor="bg-destructive"
        hoverBgColor="hover:bg-destructive/90"
      />
    );
  }
  if (action.primary) {
    return <TapTargetButtonSolid {...shared} />;
  }
  return <TapTargetButton {...shared} />;
}

export function EntityModeHeader({
  backHref,
  entityLabel,
  entityOptions,
  modes,
  actions,
  right,
}: EntityModeHeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hasSheet = Boolean(
    (modes && modes.length) || (actions && actions.length),
  );

  const label = (
    <span className="truncate max-w-[55vw] sm:max-w-[180px] text-sm font-medium text-foreground">
      {entityLabel}
    </span>
  );

  return (
    <>
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
                    className="flex items-center gap-0.5 min-w-0 rounded-full px-1.5 py-0.5 hover:bg-[var(--matrx-glass-bg-active)] transition-colors"
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
                        <Link
                          href={opt.href}
                          className="flex items-center gap-2"
                        >
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
              <span className="flex min-w-0 items-center px-1.5">{label}</span>
            )}
          </>
        }
        center={
          modes && modes.length > 0 ? (
            <div className="hidden sm:flex w-full min-w-0 justify-center">
              <RouteModeNav items={modes} />
            </div>
          ) : undefined
        }
        right={
          <>
            {/* Desktop: extras + declarative actions as tap targets */}
            <div className="hidden sm:flex items-center">
              {right}
              {actions?.map((a) => (
                <DesktopAction key={a.label} action={a} />
              ))}
            </div>
            {/* Mobile: one trigger, everything in the drawer */}
            {hasSheet && (
              <div className="sm:hidden">
                <TapTargetButton
                  icon={<MoreHorizontal className="h-4 w-4" />}
                  ariaLabel="More"
                  onClick={() => setSheetOpen(true)}
                />
              </div>
            )}
          </>
        }
      />
      {hasSheet && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Options"
        >
          <BottomSheetHeader
            title={entityLabel}
            trailing={
              <button
                onClick={() => setSheetOpen(false)}
                className="text-primary active:opacity-70 min-h-[44px] px-1 text-[15px]"
              >
                Done
              </button>
            }
          />
          <BottomSheetBody>
            {modes?.map((m) => {
              const Icon = m.icon;
              const isActive =
                m.href === pathname ||
                (pathname.startsWith(m.href) &&
                  !modes.some(
                    (o) =>
                      o.href !== m.href &&
                      o.href.length > m.href.length &&
                      pathname.startsWith(o.href),
                  ));
              return (
                <button
                  key={m.href}
                  onClick={() => {
                    setSheetOpen(false);
                    router.push(m.href);
                  }}
                  className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "w-4 h-4 mr-3 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "text-[15px] flex-1 text-left",
                      isActive && "font-medium",
                    )}
                  >
                    {m.name}
                  </span>
                  {isActive && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
            {actions?.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  disabled={a.disabled}
                  onClick={() => {
                    setSheetOpen(false);
                    if (a.href) router.push(a.href);
                    else a.onPress?.();
                  }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06] last:border-0",
                    a.destructive ? "text-destructive" : "text-foreground",
                    a.disabled && "opacity-50",
                  )}
                >
                  <Icon className="w-4 h-4 mr-3 shrink-0" />
                  <span className="text-[15px] flex-1 text-left">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </BottomSheetBody>
        </BottomSheet>
      )}
    </>
  );
}
