"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_MENU_BASE, type ContextMenuPage } from "../_registry";
import { getContextMenuIcon } from "../_registry.icons";

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

  const isHub = pathname === CONTEXT_MENU_BASE;
  const isActive = (slug: string) => {
    const href = `${CONTEXT_MENU_BASE}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="Context-menu testing suite"
      className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/60 backdrop-blur flex-shrink-0 overflow-x-auto"
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium pr-2 border-r border-border whitespace-nowrap">
        Context Menu
      </div>

      {!hideHubButton && (
        <NavButton
          href={CONTEXT_MENU_BASE}
          active={isHub}
          label="Hub"
          icon={<Home className="h-3 w-3" />}
        />
      )}

      {pages.map((page) => (
        <NavLink key={page.slug} page={page} active={isActive(page.slug)} />
      ))}
    </nav>
  );
}

function NavLink({ page, active }: { page: ContextMenuPage; active: boolean }) {
  const Icon = getContextMenuIcon(page.icon);
  return (
    <NavButton
      href={`${CONTEXT_MENU_BASE}/${page.slug}`}
      active={active}
      label={page.title}
      icon={<Icon className="h-3 w-3" />}
      title={page.tagline}
      badge={page.status === "wip" ? "wip" : undefined}
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
}: {
  href: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  title?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap",
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
