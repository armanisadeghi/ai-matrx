"use client";

// MobileDrawerUserRow — the profile row at the bottom of the mobile navigation
// drawer. Mobile's answer to the desktop bottom-left avatar (ShellUserBlock):
// same place in the person's mental map (the end of the navigation), same
// menu. Tapping it closes the drawer and opens THE profile menu — the
// `#shell-user-menu` checkbox — whose panel is bottom-anchored on mobile.
//
// Reads the person from Redux (the drawer is a client island with no
// `userData` prop); a guest sees a "Sign in" row that goes straight to login.

import { ChevronRight, LogIn, User } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import { ShellUserAvatarImage } from "../header/header-right-menu/ShellUserAvatarImage";

function openShellUserMenu() {
  const control = document.getElementById(
    "shell-user-menu",
  ) as HTMLInputElement | null;
  if (!control) {
    // Never silent: the shell root renders this checkbox; a layout without it
    // has no profile menu to open, and that is a wiring defect to fix.
    console.error(
      "[shell] #shell-user-menu is missing — MobileDrawerUserRow cannot open the profile menu. Render ShellUserBlock in this layout.",
    );
    return;
  }
  control.checked = true;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function MobileDrawerUserRow() {
  const user = useAppSelector(selectUser);
  const loginHref = useLoginHref();

  if (!user.id) {
    return (
      <AppLink
        href={loginHref}
        className="shell-mobile-nav-item shell-mobile-user-row"
        onClick={() => window.setTimeout(closeShellMobileMenu, 0)}
      >
        <span className="shell-nav-icon">
          <LogIn size={20} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Sign in</span>
      </AppLink>
    );
  }

  const name = user.userMetadata?.name ?? user.email ?? "Your account";
  const avatarUrl = user.userMetadata?.avatarUrl;

  return (
    <button
      type="button"
      className="shell-mobile-nav-item shell-mobile-user-row w-full"
      data-mobile-user-row
      onClick={() => {
        closeShellMobileMenu();
        // Let the drawer's close land before the menu's own backdrop appears.
        window.setTimeout(openShellUserMenu, 0);
      }}
      aria-label={`Account menu — ${name}`}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full matrx-glass-thin-border">
        {avatarUrl ? (
          <ShellUserAvatarImage src={avatarUrl} alt={name} sizes="28px" />
        ) : (
          <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-medium text-foreground">
          {name}
        </span>
        {user.email && user.email !== name ? (
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        ) : null}
      </span>
      <ChevronRight
        size={18}
        strokeWidth={1.75}
        className="shrink-0 text-muted-foreground"
      />
    </button>
  );
}
