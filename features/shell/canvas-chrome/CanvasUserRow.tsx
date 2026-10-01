"use client";

/**
 * CanvasUserRow — the foot of the canvas nav: avatar · name · current org ⌃.
 *
 * TWO targets, both the platform's existing pieces:
 *   - avatar + name open the SAME `UserMenuPanel` the shell header opens
 *     (sign out, Error Inspector, admin items…), through its own
 *     checkbox `#canvas-user-menu` (styles/shell.css §13c) — never the
 *     shell's `#shell-user-menu`, which still sits on the hidden user block.
 *   - the org half is THE organization control, `ShellOrgSwitcher` — the
 *     same one the sidebar's account rail and the phone drawer draw.
 */

import { User } from "lucide-react";
import { ShellOrgSwitcher } from "@/features/shell/components/account-rail/ShellOrgSwitcher";
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
      <ShellOrgSwitcher variant="inline" />
    </div>
  );
}
