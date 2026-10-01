"use client";

import { User } from "lucide-react";
import { UserData } from "@/utils/userDataMapper";
import { ShellUserAvatarImage } from "./ShellUserAvatarImage";

interface UserMenuTriggerProps {
  userData: UserData;
  /** Checkbox id for the menu toggle. Defaults to AppShell's `#shell-user-menu`. */
  menuCheckboxId?: string;
}

export default function UserMenuTrigger({
  userData,
  menuCheckboxId = "shell-user-menu",
}: UserMenuTriggerProps) {
  return (
    <label
      htmlFor={menuCheckboxId}
      aria-label="User menu"
      className="flex h-11 w-11 items-center justify-center bg-transparent transition-transform active:scale-95 cursor-pointer outline-none"
    >
      {/* No organization cue here: the organization has its own control
          (ShellOrgSwitcher), which carries every organization state. */}
      <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-colors matrx-glass-thin-border">
        {userData?.userMetadata?.avatarUrl ? (
          <ShellUserAvatarImage
            src={userData?.userMetadata.avatarUrl}
            alt={userData?.userMetadata.name || "User"}
            sizes="32px"
          />
        ) : userData?.userMetadata.name ? (
          <span className="text-xs font-semibold text-foreground leading-none">
            {userData?.userMetadata.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <User
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>
    </label>
  );
}
