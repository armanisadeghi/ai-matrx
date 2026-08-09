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
 *   accounts      ?user=   → AccountsTableClient       (searchParams.get("user"))
 *   organizations ?user=   → OrganizationsAdminClient  (searchParams.get("user"))
 *   preferences   ?user=   → PreferencesTabClient      (useSearchParams().get("user"))
 *   usage         ?user=   → UsageTableClient          (searchParams.get("user"))
 *   admins        ?user=   → users/admins/page.tsx     (seeds the table search)
 *   email         ?userId= → users/email/page.tsx      (URLSearchParams .get("userId"))
 *
 * ACCOUNTS IS THE PRIMARY DOOR, and it is what the NAME itself links to — Door
 * #1 of the four is "click the name", and a name whose only doors hide behind a
 * chevron is still a dead end to anyone who does not think to open the menu.
 * Accounts + admins both used to be broken promises (Accounts read no param at
 * all; admins still landed on an unfiltered roster while the Accounts row menu
 * advertised a filter). Both now honour `?user=`, which is why they appear here
 * — a link to a route that ignores it is worse than no link, so verify the
 * target reads the param before adding a row.
 *
 * Composes, never duplicates: when no name/email is loaded it falls back to
 * `MatrxUuidCell`, which already owns short-id display + copy + tooltip.
 *
 * Two exports, the same split `EntityRef` / `EntityDoorControls` uses:
 *   `AdminUserRef`         — the NAME with its doors (the default; prefer it)
 *   `AdminUserDoorControls` — the doors WITHOUT the name, for a surface whose
 *      name genuinely cannot be an anchor: it lives inside a `<label>` that
 *      toggles a checkbox, or inside a button that means something else (a
 *      "filter by this assignee" chip). Those render it as a SIBLING of the
 *      name — an interactive control inside a label/button is invalid DOM and
 *      a stray click would cost the user the surface they are standing in.
 * `AdminUserRef` composes the cluster, so the destination list below is
 * declared exactly once.
 */

import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Gauge,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
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
 * The user's primary destination — the Accounts roster focused on this one
 * account. Exported because the NAME links here directly; the menu repeats it
 * so the door is reachable both ways.
 */
export function accountHrefFor(userId: string): string {
  return `/administration/users?user=${encodeURIComponent(userId)}`;
}

/**
 * The verified per-user admin destinations. Add a row here ONLY after reading
 * the target route and confirming it consumes the param.
 */
function doorsFor(userId: string): UserDoor[] {
  const id = encodeURIComponent(userId);
  return [
    {
      href: accountHrefFor(userId),
      label: "Account",
      Icon: UserRound,
    },
    {
      href: `/administration/users/organizations?user=${id}`,
      label: "Organizations",
      Icon: Building2,
    },
    {
      href: `/administration/users/admins?user=${id}`,
      label: "Admin level",
      Icon: ShieldCheck,
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

export interface AdminUserDoorControlsProps {
  userId: string;
  /** Display name/email — used only for the control labels and menu heading. */
  label?: string | null;
  className?: string;
}

/**
 * The per-user admin destinations as a standalone control cluster. Every item
 * is a real `<Link>`, so middle-click / cmd-click opens a new tab without
 * costing the user the surface they are standing in.
 */
export function AdminUserDoorControls({
  userId,
  label,
  className,
}: AdminUserDoorControlsProps) {
  const heading = label?.trim() || userId;
  const doors = doorsFor(userId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Open admin surfaces for ${heading}`}
          aria-label={`Open admin surfaces for ${heading}`}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="truncate">{heading}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {doors.map(({ href, label: doorLabel, Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon className="mr-2 h-4 w-4" /> {doorLabel}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <div className="min-w-0">
        {primary ? (
          // A real anchor, not a click handler: middle-click and cmd-click open
          // the account in a new tab without costing the admin the table they
          // are standing in. stopPropagation so a row-detail click handler on
          // the enclosing table does not also fire.
          <Link
            href={accountHrefFor(userId)}
            onClick={(event) => event.stopPropagation()}
            title={`Open account ${primary}`}
            className="block truncate text-sm font-medium hover:text-primary hover:underline"
          >
            {primary}
          </Link>
        ) : (
          <MatrxUuidCell value={userId} label="User ID" />
        )}
        {secondary ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {secondary}
          </div>
        ) : null}
      </div>

      <AdminUserDoorControls userId={userId} label={primary ?? userId} />
    </div>
  );
}
