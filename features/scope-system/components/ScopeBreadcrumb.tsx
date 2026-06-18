"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Home,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /**
   * Sibling links for the crumb's dropdown. When present, a chevron button is
   * rendered next to the text; clicking it opens the sibling switcher. The text
   * itself still navigates via `href`.
   */
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
  /** When set, Back navigates here instead of `router.back()` — use on hub pages to avoid history traps. */
  backHref?: string;
  /** Where the org segment links. Defaults to the org scopes hub. */
  orgLinkHref?: string;
  className?: string;
  actions?: React.ReactNode;
  /**
   * Sibling-org options. When provided, the org crumb gets a switcher dropdown.
   * Source these via `useBreadcrumbOrgOptions`.
   */
  orgOptions?: ScopeCrumbOption[];
  /** Where the org crumb's TEXT links. Defaults to the org home page. */
  orgHomeHref?: string;
  /**
   * Renders an explicit "Scopes" hub crumb between the org and the trail so the
   * path is complete (Org › Scopes › Type › Scope › Item).
   */
  showScopesCrumb?: boolean;
  scopesHubHref?: string;
  /** Single-line layout (no wrapping) — use when injected into the header bar. */
  singleLine?: boolean;
}

/** Shared text-link styling: cursor pointer + underline on hover. */
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

function Crumb({
  label,
  href,
  icon,
  isCurrent,
  options,
  optionsLabel,
  optionsAllHref,
  optionsAllLabel,
}: {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  isCurrent?: boolean;
  options?: ScopeCrumbOption[];
  optionsLabel?: string;
  optionsAllHref?: string;
  optionsAllLabel?: string;
}) {
  const text = href ? (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5",
        CRUMB_LINK,
        isCurrent && "text-foreground font-medium",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  ) : (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 truncate max-w-[12rem]",
        isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );

  if (options && options.length > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 min-w-0">
        {text}
        <OptionsMenu
          triggerAriaLabel={`Switch ${optionsLabel ?? label}`}
          headerLabel={optionsLabel}
          options={options}
          allHref={optionsAllHref}
          allLabel={optionsAllLabel}
        />
      </span>
    );
  }
  return text;
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

  const backControl = (
    <div className="flex items-center gap-0.5 -ml-1 shrink-0">
      {backHref ? (
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-7 w-7"
          aria-label="Back"
          title="Back"
        >
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-7 w-7"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        asChild
        className="h-7 w-7"
        aria-label="Dashboard"
        title="Dashboard"
      >
        <Link href="/dashboard">
          <LayoutDashboard className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );

  const orgIcon = orgIsPersonal ? (
    <Home className="h-3.5 w-3.5 shrink-0" />
  ) : (
    <Building2 className="h-3.5 w-3.5 shrink-0" />
  );
  const orgLabel = orgIsPersonal ? "Personal workspace" : orgName;

  const crumbs = (
    <div
      className={cn(
        "flex items-center gap-1.5 text-sm min-w-0",
        singleLine ? "flex-nowrap overflow-hidden" : "flex-wrap",
      )}
    >
      {backControl}
      <span className="text-muted-foreground/50 shrink-0">·</span>
      <Crumb
        label={orgLabel}
        href={orgOptions ? orgHomeHref : orgLinkHref}
        icon={orgIcon}
        options={orgOptions}
        optionsLabel="Switch organization"
      />
      {showScopesCrumb && (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <Link href={scopesHubHref} className={CRUMB_LINK}>
            Scopes
          </Link>
        </span>
      )}
      {trail.map((node, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={i} className="inline-flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <Crumb
              label={node.label}
              href={node.href}
              isCurrent={isLast}
              options={node.options}
              optionsLabel={node.optionsLabel}
              optionsAllHref={node.optionsAllHref}
              optionsAllLabel={node.optionsAllLabel}
            />
          </span>
        );
      })}
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
        {crumbs}
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
    );
  }

  return <div className={className}>{crumbs}</div>;
}
