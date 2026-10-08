import type { ReactNode } from "react";
import AppLink from "@/components/navigation/AppLink";

/**
 * The header row every account-rail menu opens with — Settings, Organization
 * and You are ONE family (owner, 2026-10-01: "make all 3 identical"): the same
 * panel (`USER_MENU_PANEL_CLASS`), this same header (a 28px coloured mark, a
 * title, an optional one-line subtitle), and the same rows (`MENU_ITEM_CLASS`).
 * With `href` the header is a door to its own page.
 */
export function RailMenuHeader({
  mark,
  title,
  titleNode,
  subtitle,
  href,
  onNavigate,
}: {
  mark: ReactNode;
  title: string;
  /** Stands in for the title (a skeleton while the name is on its way). */
  titleNode?: ReactNode;
  subtitle?: string | null;
  href?: string;
  onNavigate?: () => void;
}) {
  const body = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
        {mark}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium text-foreground">{titleNode ?? title}</span>
        {subtitle ? <span className="truncate type-secondary text-muted-foreground">{subtitle}</span> : null}
      </span>
    </>
  );
  const className =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors";
  return href ? (
    <AppLink
      href={href}
      onClick={onNavigate}
      className={`${className} hover:bg-[var(--matrx-glass-bg-hover)]`}
      data-rail-menu-header=""
    >
      {body}
    </AppLink>
  ) : (
    <div className={className} data-rail-menu-header="">
      {body}
    </div>
  );
}

/** The thin divider between a rail menu's sections — the same one the account menu uses. */
export const RAIL_MENU_DIVIDER = <div className="mx-2 my-1 h-px bg-[var(--matrx-glass-border-color)]" />;
