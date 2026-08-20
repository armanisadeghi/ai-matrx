"use client";

import { useSyncExternalStore } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  parseRememberedAccount,
  REMEMBERED_ACCOUNT_KEY,
} from "@/utils/auth/remembered-account";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(REMEMBERED_ACCOUNT_KEY);
}

export function RememberedSignInHeading({
  fallback = "Sign in to your account",
  destinationLabel,
}: {
  fallback?: React.ReactNode;
  destinationLabel?: string;
} = {}) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const account = parseRememberedAccount(raw);
  if (!account) return <>{fallback}</>;

  const firstName = account.displayName.split(/\s+/)[0] || account.displayName;
  const initials = account.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <Avatar className="h-12 w-12 border border-border shadow-sm">
        {account.avatarUrl ? (
          <AvatarImage src={account.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-sm text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span>Welcome back, {firstName}</span>
      <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
        You’ve been signed out. Sign in again to continue
        {destinationLabel ? ` to ${destinationLabel}` : ""}.
      </span>
    </span>
  );
}
