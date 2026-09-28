"use client";

// features/mandates/admin-list/MandateAdminPagesNav.tsx
//
// The admin mandate list's header actions: every other mandate admin page is
// reached from HERE, never from the menu (one menu entry per thing —
// Intelligence → Mandates). Dashboard, Health and Unconverted AI calls sit
// inline on wide screens; everything else lives in the More menu, beside the
// grade legend. New mandate is the one primary action.

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Code2,
  MoreHorizontal,
  PanelTop,
  Plus,
  Table2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ADMIN_MANDATES_DASHBOARD,
  ADMIN_MANDATES_HEALTH,
  ADMIN_MANDATES_NEW,
  ADMIN_MANDATES_RAW_TABLES,
  ADMIN_MANDATES_REFERENCES,
  ADMIN_MANDATES_UNCONVERTED,
  ADMIN_MANDATES_WINDOW,
} from "@/features/mandates/admin-routes";

interface PageLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const INLINE_PAGES: readonly PageLink[] = [
  { href: ADMIN_MANDATES_DASHBOARD, label: "Dashboard", icon: BarChart3 },
  { href: ADMIN_MANDATES_HEALTH, label: "Health", icon: Activity },
  { href: ADMIN_MANDATES_UNCONVERTED, label: "Unconverted AI calls", icon: AlertTriangle },
];

const MORE_PAGES: readonly PageLink[] = [
  { href: ADMIN_MANDATES_WINDOW, label: "Mandate window", icon: PanelTop },
  { href: ADMIN_MANDATES_REFERENCES, label: "References", icon: Code2 },
  { href: ADMIN_MANDATES_RAW_TABLES, label: "Raw tables", icon: Table2 },
];

function MenuLink({ page }: { page: PageLink }) {
  const Icon = page.icon;
  return (
    <DropdownMenuItem asChild>
      <Link href={page.href} className="gap-2">
        <Icon className="h-3.5 w-3.5" />
        {page.label}
      </Link>
    </DropdownMenuItem>
  );
}

export function MandateAdminPagesNav() {
  return (
    <>
      <div className="hidden items-center gap-1 lg:flex">
        {INLINE_PAGES.map((page) => {
          const Icon = page.icon;
          return (
            <Button key={page.href} asChild variant="ghost" size="sm" className="h-8 gap-1">
              <Link href={page.href}>
                <Icon className="h-3.5 w-3.5" />
                {page.label}
              </Link>
            </Button>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="More mandate pages">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="lg:hidden">
            {INLINE_PAGES.map((page) => (
              <MenuLink key={page.href} page={page} />
            ))}
            <DropdownMenuSeparator />
          </div>
          {MORE_PAGES.map((page) => (
            <MenuLink key={page.href} page={page} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild size="sm" className="h-8 gap-1">
        <Link href={ADMIN_MANDATES_NEW}>
          <Plus className="h-3.5 w-3.5" />
          New mandate
        </Link>
      </Button>
    </>
  );
}
