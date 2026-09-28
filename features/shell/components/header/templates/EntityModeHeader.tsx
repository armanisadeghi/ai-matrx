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

import { useBackHref } from "@/lib/navigation/useBackHref";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePhonePageActions } from "@/features/shell/components/header/phone-page-actions";
import AppLink from "@/components/navigation/AppLink";
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
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import {
  TapTargetButton,
  TapTargetButtonDestructive,
  TapTargetButtonSolid,
} from "@ai-matrx/tap-target";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

const EXTERNAL_HREF_RE = /^(https?:|mailto:|tel:)/;

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
  /** Solid warning (amber) pill — an action needed to unblock a feature. */
  warning?: boolean;
  disabled?: boolean;
  /**
   * Open `href` in a new tab. The icon (e.g. an up-right arrow) must match the
   * behavior — a "leaves this page" glyph on a same-tab link is a lie.
   */
  newTab?: boolean;
  /**
   * Show the NAME beside the icon on desktop (glass, not solid). For a page
   * whose icon-only actions would otherwise read as unlabeled glyphs.
   */
  showLabel?: boolean;
  /**
   * Keep this action visible in the PHONE header row too (e.g. Save while
   * there are unsaved changes), not only in the ⋮ sheet. Use for at most one
   * action; the name gives up room to it.
   */
  pinnedOnPhone?: boolean;
  /**
   * Only in the PHONE ⋮ sheet — for an action whose desktop form is a control
   * passed through `right` (e.g. the copy-reference button), so the phone does
   * not lose it and the desktop does not show it twice.
   */
  phoneOnly?: boolean;
}

export interface EntityModeHeaderProps {
  /** Back fallback (the family's list page): Back returns where this tab came from, and uses this only when nothing is behind it (opened from a link). */
  backHref: string;
  /** Current entity's name — small, in the top row, never an h1. */
  entityLabel: string;
  /** Compact status beside the identity, visible at every breakpoint. */
  entityStatus?: React.ReactNode;
  /** Sibling entities for the name dropdown. Omit for a plain label. */
  entityOptions?: EntityOption[];
  /** Sub-view nav (View | Edit | …). Center pill on desktop; drawer rows on mobile. */
  modes?: RouteNavItem[];
  /**
   * Explicit active mode href. Required when modes differ only by query string
   * (`?view=grid`) — pathname matching alone cannot tell those apart.
   */
  activeModeHref?: string;
  /**
   * Switch modes without `router.push` — for modes that are client-side views
   * of one page (a shallow `?mode=` URL update, no server round-trip).
   */
  onModeSelect?: (href: string) => void;
  /**
   * PHONE: switch modes in one tap from the header row — one small button for
   * the mode you are NOT in (View ⇄ Edit) — instead of a trip into the sheet.
   */
  modeSwitchOnPhone?: boolean;
  /** Declarative actions — glass tap targets on desktop, drawer rows on mobile. */
  actions?: EntityHeaderAction[];
  /** Desktop-only extra controls (e.g. a Switch). Hidden below sm. */
  right?: React.ReactNode;
}

function DesktopAction({ action }: { action: EntityHeaderAction }) {
  const Icon = action.icon;
  const shared = {
    icon: <Icon className="h-4 w-4" />,
    onClick: action.onPress,
    href: action.href,
    disabled: action.disabled,
    target: action.newTab ? ("_blank" as const) : undefined,
    rel: action.newTab ? "noopener noreferrer" : undefined,
  };
  // Primary + destructive show their NAME inline (like the demo's Send /
  // Delete pills); plain glass actions stay icon-only with a tooltip
  // (tap targets tooltip automatically from ariaLabel when no label).
  if (action.destructive) {
    return <TapTargetButtonDestructive {...shared} label={action.label} />;
  }
  if (action.warning) {
    return (
      <TapTargetButtonSolid
        {...shared}
        label={action.label}
        bgColor="bg-warning"
        iconColor="text-warning-foreground"
        hoverBgColor="hover:bg-warning/90"
      />
    );
  }
  if (action.primary) {
    return <TapTargetButtonSolid {...shared} label={action.label} />;
  }
  if (action.showLabel) {
    return (
      <TapTargetButton {...shared} ariaLabel={action.label} label={action.label} />
    );
  }
  return <TapTargetButton {...shared} ariaLabel={action.label} />;
}

/**
 * The mode + action rows — ONE list, drawn by this header's own sheet and, on a
 * phone, directly inside the shell's ⋮ sheet ("This page"), so a record's
 * options are one step, never a sheet that opens a second sheet (page-pass
 * shared defects, 2026-09-27).
 */
function EntitySheetRows({
  modes,
  actions,
  activeHref,
  onModeSelect,
  onDone,
}: {
  modes?: EntityModeHeaderProps["modes"];
  actions?: EntityHeaderAction[];
  activeHref?: string;
  onModeSelect?: (href: string) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const activeMode = activeHref ? { href: activeHref } : undefined;
  const setSheetOpen = (_open: false) => onDone();
  // Full-width rows, stacked — inside the shell's sheet these must read as a
  // list of one-tap items, never squeezed side by side ("Vie w").
  return (
    <div className="flex w-full min-w-0 flex-col" data-entity-sheet-rows>
            {modes?.map((m) => {
        const Icon = m.icon;
        const isActive = m.href === activeMode?.href;
        return (
          <button
            key={m.href}
            onClick={() => {
              setSheetOpen(false);
              if (onModeSelect) onModeSelect(m.href);
              else router.push(m.href);
            }}
            className="flex items-center w-full px-5 min-h-[52px] active:bg-glass-active transition-colors border-b border-glass-edge"
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
              if (a.href) {
                if (a.newTab || EXTERNAL_HREF_RE.test(a.href)) {
                  window.open(a.href, "_blank", "noopener,noreferrer");
                } else {
                  router.push(a.href);
                }
              } else {
                a.onPress?.();
              }
            }}
            className={cn(
              "flex items-center w-full px-5 min-h-[52px] active:bg-glass-active transition-colors border-b border-glass-edge last:border-0",
              a.destructive
                ? "text-destructive"
                : a.warning
                  ? "text-warning"
                  : "text-foreground",
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
    </div>
  );
}

export function EntityModeHeader({
  backHref,
  entityLabel,
  entityStatus,
  entityOptions,
  modes,
  activeModeHref,
  onModeSelect,
  modeSwitchOnPhone,
  actions,
  right,
}: EntityModeHeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // On a phone the shell's ⋮ hosts this header's options directly.
  const isPhone = useIsMobile();
  const { host: phoneSheetHost } = usePhonePageActions();
  const inShellSheet = isPhone && phoneSheetHost != null;
  // Back returns where this tab came from (filters included); `backHref` is
  // the fallback for a page opened straight from a link.
  const resolvedBackHref = useBackHref(backHref);
  const router = useRouter();
  const pathname = usePathname();
  const activeMode = activeModeHref
    ? modes?.find((mode) => mode.href === activeModeHref)
    : resolveActiveRouteMode(modes ?? [], pathname);
  const hasSheet = Boolean(
    (modes && modes.length) || (actions && actions.length),
  );

  const label = (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* A floor under the name: on a phone the shell's right-side icons
          squeezed it to nothing ("Fa…", then blank beside its status). The
          cap is on the NAME only, so a status beside it never steals its room. */}
      <span className="min-w-12 max-w-[55vw] truncate text-sm font-medium text-foreground sm:max-w-[min(360px,32vw)]">
        {entityLabel}
      </span>
      {entityStatus}
    </span>
  );

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href={resolvedBackHref} ariaLabel="Back" />
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
                  <div className="max-h-[60dvh] overflow-y-auto">
                    {entityOptions.map((opt) => (
                      <DropdownMenuItem
                        key={opt.href}
                        asChild
                        className={cn(opt.active && "bg-accent/60")}
                      >
                        <AppLink
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
                        </AppLink>
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="flex min-w-0 items-center px-1.5">{label}</span>
            )}
            {isPhone &&
              modeSwitchOnPhone &&
              modes
                ?.filter((m) => m.href !== activeMode?.href)
                .slice(0, 1)
                .map((m) => {
                  const Icon = m.icon ?? MoreHorizontal;
                  return (
                    <span key={`mode-${m.href}`} className="shrink-0">
                      <TapTargetButton
                        icon={<Icon className="h-4 w-4" />}
                        ariaLabel={m.name}
                        onClick={() =>
                          onModeSelect ? onModeSelect(m.href) : router.push(m.href)
                        }
                      />
                    </span>
                  );
                })}
            {isPhone &&
              actions
                ?.filter((a) => a.pinnedOnPhone)
                .map((a) => (
                  <span key={`pinned-${a.label}`} className="shrink-0">
                    <DesktopAction action={a} />
                  </span>
                ))}
          </>
        }
        center={
          modes && modes.length > 0 ? (
            <div className="hidden sm:flex w-full min-w-0 justify-center">
              <RouteModeNav
                items={modes}
                activeHref={activeModeHref}
                onNavigate={onModeSelect}
              />
            </div>
          ) : undefined
        }
        right={
          inShellSheet ? (
            hasSheet ? (
              <EntitySheetRows
                modes={modes}
                actions={actions}
                activeHref={activeMode?.href}
                onModeSelect={onModeSelect}
                onDone={() => {}}
              />
            ) : undefined
          ) : (
          <>
            {/* Desktop: extras + declarative actions as tap targets */}
            <div className="hidden sm:flex items-center">
              {right}
              {actions
                ?.filter((a) => !a.phoneOnly)
                .map((a) => (
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
          )
        }
      />
      {hasSheet && !inShellSheet && (
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
            <EntitySheetRows
              modes={modes}
              actions={actions}
              activeHref={activeMode?.href}
              onModeSelect={onModeSelect}
              onDone={() => setSheetOpen(false)}
            />
          </BottomSheetBody>
        </BottomSheet>
      )}
    </>
  );
}
