"use client";

import { User } from "lucide-react";
import { UserData } from "@/utils/userDataMapper";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";
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
  // Soft org enforcement: ring the avatar red when no org is selected, nudging
  // the user to choose one (alongside the in-header HeaderChooseOrgButton). Gated on
  // the bootstrap-resolved flag so it never flashes red during boot before the
  // default/personal org has resolved.
  const promptForOrg = useAppSelector(selectShouldPromptForOrganization);

  return (
    <label
      htmlFor={menuCheckboxId}
      aria-label="User menu"
      className="flex h-11 w-11 items-center justify-center bg-transparent transition-transform active:scale-95 cursor-pointer outline-none"
    >
      <div
        className={[
          "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors overflow-hidden",
          promptForOrg
            ? "ring-2 ring-red-500 ring-offset-1 ring-offset-[var(--shell-header-bg,transparent)]"
            : "matrx-glass-thin-border",
        ].join(" ")}
      >
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
