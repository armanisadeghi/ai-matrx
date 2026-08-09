"use client";

/**
 * AdminUserRef — THE door for a USER inside the Users & Access admin console.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md) says a named record must
 * be reachable. A user is the one entity in this console that has **no
 * canonical record route**: there is no `user` token in
 * `features/scopes/registry/entityRegistry.ts`, no `/users/<id>` page, and
 * `/administration/users` (Accounts) accepts no deep-link param — so
 * `EntityRef` has nothing to resolve and a bare `<span>` name (or worse, a raw
 * uuid) is what every one of these tables shipped.
 *
 * What the platform DOES have is a set of real, param-consuming per-user admin
 * destinations. This component is the ONE place that set is declared, so the
 * five surfaces that name a user (Accounts, Organization members, Admins,
 * Preferences drift, Usage) stop being dead ends without each inventing its own
 * link list — and so the day a canonical user route exists, one edit here lights
 * up all of them.
 *
 * Every destination below was verified to actually READ its param:
 *   organizations ?user=   → OrganizationsAdminClient  (searchParams.get("user"))
 *   preferences   ?user=   → PreferencesTabClient      (useSearchParams().get("user"))
 *   usage         ?user=   → UsageTableClient          (searchParams.get("user"))
 *   email         ?userId= → users/email/page.tsx      (URLSearchParams .get("userId"))
 *
 * DELIBERATELY ABSENT: `/administration/users/admins?user=<id>`. That page reads
 * no search param at all, so the link would land on an unfiltered list while
 * promising a filtered one — a link to a route that does not honour it is worse
 * than no link.
 *
 * Composes, never duplicates: when no name/email is loaded it falls back to
 * `MatrxUuidCell`, which already owns short-id display + copy + tooltip.
 */

import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Gauge,
  Mail,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { cn } from "@/lib/utils";

export interface AdminUserRefProps {
  userId: string;
  /** Display name, when the surface has it loaded. */
  name?: string | null;
  /** Email — shown as the secondary line, and used as the label when unnamed. */
  email?: string | null;
  /** Hide the secondary email line (dense tables that show email in its own column). */
  hideEmail?: boolean;
  className?: string;
}

interface UserDoor {
  href: string;
  label: string;
  Icon: typeof Building2;
}

/**
 * The verified per-user admin destinations. Add a row here ONLY after reading
 * the target route and confirming it consumes the param.
 */
function doorsFor(userId: string): UserDoor[] {
  const id = encodeURIComponent(userId);
  return [
    {
      href: `/administration/users/organizations?user=${id}`,
      label: "Organizations",
      Icon: Building2,
    },
    {
      href: `/administration/users/preferences?user=${id}`,
      label: "Preferences",
      Icon: SlidersHorizontal,
    },
    {
      href: `/administration/users/usage?user=${id}`,
      label: "Usage & cost",
      Icon: Gauge,
    },
    {
      href: `/administration/users/email?userId=${id}`,
      label: "Email user",
      Icon: Mail,
    },
  ];
}

export function AdminUserRef({
  userId,
  name,
  email,
  hideEmail = false,
  className,
}: AdminUserRefProps) {
  const primary = name?.trim() || email?.trim() || null;
  const secondary = !hideEmail && primary !== email ? email?.trim() : null;
  const doors = doorsFor(userId);

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <div className="min-w-0">
        {primary ? (
          <div className="truncate text-sm font-medium">{primary}</div>
        ) : (
          <MatrxUuidCell value={userId} label="User ID" />
        )}
        {secondary ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {secondary}
          </div>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Open admin surfaces for ${primary ?? userId}`}
            aria-label={`Open admin surfaces for ${primary ?? userId}`}
            onClick={(event) => event.stopPropagation()}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-52"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="truncate">
            {primary ?? userId}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {doors.map(({ href, label, Icon }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href}>
                <Icon className="mr-2 h-4 w-4" /> {label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
