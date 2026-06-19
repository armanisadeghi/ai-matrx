"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButtonTransparent } from "@/components/icons/TapTargetButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/styles/themes/utils";
import {
  orgScopesHref,
  orgHref,
} from "@/features/scope-system/utils/scopeRoutes";

/** One selectable sibling inside a breadcrumb crumb's dropdown. */
export interface ScopeCrumbOption {
  label: string;
  href: string;
  /** Marks the current node so the dropdown can show a check + highlight. */
  active?: boolean;
}

export interface ScopeBreadcrumbTrailNode {
  label: string;
  /** Where clicking the crumb's TEXT navigates (the level itself). */
  href?: string;
  /** Sibling links for the crumb's dropdown / drawer section. */
  options?: ScopeCrumbOption[];
  /** Optional header label shown above the options list (e.g. "Patients"). */
  optionsLabel?: string;
  /** Optional "see all" link appended to the bottom of the dropdown. */
  optionsAllHref?: string;
  optionsAllLabel?: string;
}

export interface ScopeBreadcrumbProps {
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  trail?: ScopeBreadcrumbTrailNode[];
  /** When set, Back navigates here instead of `router.back()`. */
  backHref?: string;
  /** Where the org segment links. Defaults to the org scopes hub. */
  orgLinkHref?: string;
  className?: string;
  actions?: React.ReactNode;
  /** Sibling-org options. Source via `useBreadcrumbOrgOptions`. */
  orgOptions?: ScopeCrumbOption[];
  /** Where the org crumb's TEXT links. Defaults to the org home page. */
  orgHomeHref?: string;
  /** Renders an explicit "Scopes" hub crumb between the org and the trail. */
  showScopesCrumb?: boolean;
  scopesHubHref?: string;
  /** Single-line layout (no wrapping) — use when injected into the header bar. */
  singleLine?: boolean;
}

/** Normalized crumb used by both the desktop row and the mobile drawer. */
interface Level {
  key: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  options?: ScopeCrumbOption[];
  optionsLabel?: string;
  optionsAllHref?: string;
  optionsAllLabel?: string;
  isCurrent?: boolean;
}

const CRUMB_LINK =
  "truncate max-w-[12rem] cursor-pointer text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors";

function OptionsMenu({
  triggerAriaLabel,
  headerLabel,
  options,
  allHref,
  allLabel,
}: {
  triggerAriaLabel: string;
  headerLabel?: string;
  options: ScopeCrumbOption[];
  allHref?: string;
  allLabel?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[12rem] max-w-[20rem]"
      >
        {headerLabel && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {headerLabel}
          </DropdownMenuLabel>
        )}
        <div className="max-h-[60vh] overflow-y-auto">
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.href}
              asChild
              className={cn(opt.active && "bg-accent/60")}
            >
              <Link href={opt.href} className="flex items-center gap-2">
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    opt.active ? "opacity-100 text-primary" : "opacity-0",
                  )}
                />
                <span className="truncate">{opt.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        {allHref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={allHref} className="text-muted-foreground">
                {allLabel ?? "View all"}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopCrumb({ level }: { level: Level }) {
  const text = level.href ? (
    <Link
      href={level.href}
      className={cn(
        "inline-flex items-center gap-1.5",
        CRUMB_LINK,
        level.isCurrent && "text-foreground font-medium",
      )}
    >
      {level.icon}
      <span className="truncate">{level.label}</span>
    </Link>
  ) : (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 truncate max-w-[12rem]",
        level.isCurrent
          ? "text-foreground font-medium"
          : "text-muted-foreground",
      )}
    >
      {level.icon}
      <span className="truncate">{level.label}</span>
    </span>
  );

  if (level.options && level.options.length > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 min-w-0">
        {text}
        <OptionsMenu
          triggerAriaLabel={`Switch ${level.optionsLabel ?? level.label}`}
          headerLabel={level.optionsLabel}
          options={level.options}
          allHref={level.optionsAllHref}
          allLabel={level.optionsAllLabel}
        />
      </span>
    );
  }
  return text;
}

/** iPhone-style bottom-sheet navigator: every level + its siblings, all tappable. */
function MobileBreadcrumbDrawer({ levels }: { levels: Level[] }) {
  const current = levels[levels.length - 1];
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Navigate"
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-accent/60 active:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {current?.icon}
          <span className="truncate max-w-[55vw]">{current?.label ?? ""}</span>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base">Navigate</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {levels.map((level) => {
            const rows: { href: string; label: string; active?: boolean }[] =
              level.options && level.options.length > 0
                ? level.options.map((o) => ({
                    href: o.href,
                    label: o.label,
                    active: o.active,
                  }))
                : level.href
                  ? [{ href: level.href, label: level.label, active: true }]
                  : [];
            if (rows.length === 0) return null;
            return (
              <div key={level.key} className="border-t border-border/60 py-1">
                <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {level.optionsLabel ?? level.label}
                </p>
                {rows.map((row) => (
                  <DrawerClose asChild key={row.href}>
                    <Link
                      href={row.href}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-base",
                        "hover:bg-accent active:bg-accent",
                        row.active && "bg-accent/50",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          row.active ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{row.label}</span>
                    </Link>
                  </DrawerClose>
                ))}
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function ScopeBreadcrumb({
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  trail = [],
  backHref,
  orgLinkHref = orgScopesHref(orgSlugOrId),
  className,
  actions,
  orgOptions,
  orgHomeHref = orgHref(orgSlugOrId),
  showScopesCrumb = false,
  scopesHubHref = orgScopesHref(orgSlugOrId),
  singleLine = false,
}: ScopeBreadcrumbProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const orgLabel = orgIsPersonal ? "Personal workspace" : orgName;

  // Normalize org + optional Scopes hub + trail into a single level list.
  const levels: Level[] = [
    {
      key: "org",
      label: orgLabel,
      href: orgOptions ? orgHomeHref : orgLinkHref,
      options: orgOptions,
      optionsLabel: orgOptions ? "Switch organization" : undefined,
    },
    ...(showScopesCrumb
      ? [{ key: "scopes", label: "Scopes", href: scopesHubHref } as Level]
      : []),
    ...trail.map((node, i) => ({
      key: `t${i}`,
      label: node.label,
      href: node.href,
      options: node.options,
      optionsLabel: node.optionsLabel,
      optionsAllHref: node.optionsAllHref,
      optionsAllLabel: node.optionsAllLabel,
      isCurrent: i === trail.length - 1,
    })),
  ];

  const backControl = (
    <div className="flex items-center -ml-1.5 shrink-0">
      <ChevronLeftTapButton
        variant="transparent"
        ariaLabel="Back"
        href={backHref}
        onClick={backHref ? undefined : () => router.back()}
      />
      <TapTargetButtonTransparent
        ariaLabel="Organizations"
        href="/organizations"
        icon={<Building className="h-4 w-4" />}
      />
    </div>
  );

  const content = isMobile ? (
    <div className="flex items-center gap-1 min-w-0">
      {backControl}
      <MobileBreadcrumbDrawer levels={levels} />
    </div>
  ) : (
    <div
      className={cn(
        "flex items-center gap-1.5 text-sm min-w-0",
        singleLine ? "flex-nowrap overflow-hidden" : "flex-wrap",
      )}
    >
      {backControl}
      <span className="text-muted-foreground/50 shrink-0">·</span>
      {levels.map((level, i) => (
        <span
          key={level.key}
          className="inline-flex items-center gap-1.5 min-w-0"
        >
          {i > 0 && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          )}
          <DesktopCrumb level={level} />
        </span>
      ))}
    </div>
  );

  if (actions) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          singleLine ? "flex-nowrap" : "flex-wrap",
          className,
        )}
      >
        {content}
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}
