"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createElement, useTransition, type MouseEvent } from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_MENU_BASE, type ContextMenuPage } from "../_registry";
import { CONTEXT_MENU_ICONS } from "../_registry.icons";

interface ContextMenuNavProps {
  pages: ContextMenuPage[];
  /** When true, omits the "Hub" button — used on the hub itself. */
  hideHubButton?: boolean;
}

/**
 * Nav strip rendered above every sub-page. Driven entirely from the
 * registry. Adding a new page = new entry in `_registry.ts`, no edit here.
 *
 * Active-route detection is prefix-based: any path under `/ssr/context-menu/<slug>/...`
 * highlights that page's button. The hub (exact-match on `/ssr/context-menu`)
 * is highlighted separately.
 */
export function ContextMenuNav({
  pages,
  hideHubButton = false,
}: ContextMenuNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isHub = pathname === CONTEXT_MENU_BASE;
  const isActive = (slug: string) => {
    const href = `${CONTEXT_MENU_BASE}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const activeHref =
    pages
      .map((page) => `${CONTEXT_MENU_BASE}/${page.slug}`)
      .find((href) => pathname === href || pathname.startsWith(`${href}/`)) ??
    CONTEXT_MENU_BASE;

  const navigate = (href: string) => {
    if (href === pathname || isPending) return;
    startTransition(() => router.push(href));
  };

  return (
    <nav
      aria-label="Context-menu testing suite"
      className="flex-shrink-0 border-b border-border bg-card/60 backdrop-blur"
    >
      <div className="flex min-h-11 items-center gap-2 px-3 lg:hidden">
        <Home className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <label
          htmlFor="context-menu-demo-page"
          className="shrink-0 text-xs font-semibold text-foreground"
        >
          Demo page
        </label>
        <select
          id="context-menu-demo-page"
          value={activeHref}
          disabled={isPending}
          onChange={(event) => navigate(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[16px] text-foreground outline-none focus:ring-2 focus:ring-primary disabled:cursor-progress disabled:opacity-60"
        >
          {!hideHubButton && <option value={CONTEXT_MENU_BASE}>Hub</option>}
          {pages.map((page) => (
            <option key={page.slug} value={`${CONTEXT_MENU_BASE}/${page.slug}`}>
              {page.title}
              {page.status === "wip" ? " (WIP)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden min-h-11 items-center gap-1 overflow-x-auto px-3 lg:flex">
        <div className="whitespace-nowrap border-r border-border pr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Context Menu
        </div>

        {!hideHubButton && (
          <NavButton
            href={CONTEXT_MENU_BASE}
            active={isHub}
            label="Hub"
            icon={<Home className="h-3.5 w-3.5" />}
            isPending={isPending}
            onNavigate={navigate}
          />
        )}

        {pages.map((page) => (
          <NavLink
            key={page.slug}
            page={page}
            active={isActive(page.slug)}
            isPending={isPending}
            onNavigate={navigate}
          />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  page,
  active,
  isPending,
  onNavigate,
}: {
  page: ContextMenuPage;
  active: boolean;
  isPending: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <NavButton
      href={`${CONTEXT_MENU_BASE}/${page.slug}`}
      active={active}
      label={page.title}
      icon={createElement(CONTEXT_MENU_ICONS[page.icon], {
        className: "h-3.5 w-3.5",
      })}
      title={page.tagline}
      badge={page.status === "wip" ? "wip" : undefined}
      isPending={isPending}
      onNavigate={onNavigate}
    />
  );
}

function NavButton({
  href,
  active,
  label,
  icon,
  title,
  badge,
  isPending,
  onNavigate,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  title?: string;
  badge?: string;
  isPending: boolean;
  onNavigate: (href: string) => void;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  };

  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      aria-disabled={isPending}
      onClick={handleClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded px-3 text-xs font-medium transition-colors",
        isPending && "pointer-events-none opacity-60",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
      {badge && (
        <span className="text-[9px] uppercase tracking-wide bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 px-1 py-0.5 rounded">
          {badge}
        </span>
      )}
    </Link>
  );
}
