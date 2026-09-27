"use client";

/**
 * CanvasUserRow — the foot of the canvas nav: avatar · name · current org ⌃.
 *
 * TWO targets, both the platform's existing pieces:
 *   - avatar + name open the SAME `UserMenuPanel` the shell header opens
 *     (sign out, theme, Error Inspector, admin items…), through its own
 *     checkbox `#canvas-user-menu` (styles/shell.css §13c) — never the
 *     shell's `#shell-user-menu`, which still sits on the hidden user block.
 *   - the org half opens a DROP-UP of the person's organizations with their
 *     role, a check on the active one, and Manage organizations. Switching
 *     goes through `useActiveOrganizationPicker().selectOrganization` — the
 *     one sanctioned switch (`chooseActiveOrganization`). Org only: the scope
 *     tree stays in the composer's Scope pill.
 */

import { useState } from "react";
import { Check, ChevronsUpDown, Settings2, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { cn } from "@/lib/utils";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import UserMenuPanel from "@/features/shell/components/header/header-right-menu/UserMenuPanel";
import { MenuCheckboxIdProvider } from "@/features/shell/components/header/header-right-menu/menuCheckboxId";
import { ShellUserAvatarImage } from "@/features/shell/components/header/header-right-menu/ShellUserAvatarImage";
import { useShellUserData } from "@/features/shell/components/header/header-right-menu/ShellUserMenu";

const CANVAS_USER_MENU_ID = "canvas-user-menu";

export function CanvasUserRow({ onMenuOpenChange }: { onMenuOpenChange?: (open: boolean) => void }) {
  const userData = useShellUserData();
  if (!userData) return null;

  const name = userData.userMetadata?.name || userData.email || "You";
  const avatarUrl = userData.userMetadata?.avatarUrl;

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 rounded-lg">
      <MenuCheckboxIdProvider id={CANVAS_USER_MENU_ID}>
        <div className="canvas-user-menu-root min-w-0 flex-1">
          <input
            type="checkbox"
            id={CANVAS_USER_MENU_ID}
            aria-hidden="true"
            className="sr-only"
            onChange={(e) => onMenuOpenChange?.(e.currentTarget.checked)}
          />
          <label
            htmlFor={CANVAS_USER_MENU_ID}
            aria-label="Account menu"
            className="flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-sm text-foreground hover:bg-accent"
          >
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground text-[11px] font-semibold text-background">
              {avatarUrl ? (
                <ShellUserAvatarImage src={avatarUrl} alt={name} sizes="24px" />
              ) : userData.userMetadata?.name ? (
                name.charAt(0).toUpperCase()
              ) : (
                <User className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{name}</span>
          </label>
          <label htmlFor={CANVAS_USER_MENU_ID} className="shell-user-menu-backdrop" aria-hidden="true" />
          <div className="shell-user-menu-panel">
            <UserMenuPanel userData={userData} menuCheckboxId={CANVAS_USER_MENU_ID} />
          </div>
        </div>
      </MenuCheckboxIdProvider>
      <CanvasOrgDropUp onOpenChange={onMenuOpenChange} />
    </div>
  );
}

function CanvasOrgDropUp({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const { activeOrgId, activeOrgName, organizations, loading, loadFailed, selectOrganization } =
    useActiveOrganizationPicker();

  // Scratch organizations a test lane made are classified in the data
  // (`is_test_fixture`) — the canonical picker hides them the same way.
  const listed = organizations.filter((org) => !org.is_test_fixture || org.id === activeOrgId);
  // Only a successful read can say how many it hid.
  const hiddenCount = loadFailed ? 0 : organizations.length - listed.length;

  const setBoth = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Popover open={open} onOpenChange={setBoth}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={activeOrgName ? `Organization: ${activeOrgName}` : "Choose an organization"}
          className={cn(
            "flex h-9 max-w-[45%] shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
            open && "bg-accent text-foreground",
          )}
        >
          <span className="min-w-0 truncate">{activeOrgName ?? "No organization"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sizing="content" className="p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">Organization</p>
        <div className="max-h-72 overflow-y-auto">
          {loading && listed.length === 0 ? (
            <div className="space-y-1 px-2 py-1" aria-busy="true" aria-label="Loading your organizations">
              <div className="h-6 animate-pulse rounded-md bg-muted" />
              <div className="h-6 animate-pulse rounded-md bg-muted" />
            </div>
          ) : null}
          {loadFailed ? (
            <ErrorNotice
              size="inline"
              className="px-2.5 py-1.5 text-xs"
              message="Your organizations could not be loaded. Manage organizations below still works."
              operation="List my organizations"
            />
          ) : null}
          {listed.map((org) => {
            const active = org.id === activeOrgId;
            return (
              <button
                key={org.id}
                type="button"
                // The active organization is where the eye goes first: it is
                // scrolled into view when the list opens, never below the fold.
                ref={active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => {
                  if (!active) selectOrganization(org.id, org.name);
                  setBoth(false);
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-accent",
                  active && "bg-accent/60",
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold text-background">
                  {(org.abbreviation || org.name).slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{org.role}</span>
                {active ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-label="Active" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
        {!loadFailed && hiddenCount > 0 ? (
          <p className="px-2.5 pt-1 text-[11px] text-muted-foreground">
            {hiddenCount} test organization{hiddenCount === 1 ? "" : "s"} not shown — see Manage organizations.
          </p>
        ) : null}
        <div className="mx-1.5 my-1 h-px bg-border" />
        <AppLink
          href="/organizations"
          onClick={() => setBoth(false)}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-accent"
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Manage organizations
        </AppLink>
      </PopoverContent>
    </Popover>
  );
}
