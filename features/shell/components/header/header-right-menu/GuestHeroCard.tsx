"use client";

import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top-of-panel signup hero shown to unauthenticated visitors in the
 * shell user menu. Voice and footer copy mirror `SignupConversionModal`
 * so the conversion surfaces stay coherent.
 *
 * Both CTAs preserve `returnUrl` so the visitor lands back on the same
 * page after authenticating.
 */
export function GuestHeroCard() {
  const returnUrl =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : "";
  const signUpHref = `/sign-up${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;
  const signInHref = `/login${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;

  return (
    <div className="px-2 pt-1 pb-2">
      <div
        className={cn(
          "rounded-lg p-3",
          "bg-gradient-to-br from-blue-500/10 to-violet-500/10",
          "border border-blue-500/20 dark:border-violet-500/20",
        )}
      >
        <p className="text-sm font-semibold text-foreground leading-tight">
          Create your free account
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">
          Save your work, build agents, unlock unlimited runs.
        </p>

        <div className="flex flex-col gap-1.5 mt-2.5">
          <Link
            href={signUpHref}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold",
              "bg-gradient-to-r from-blue-600 to-violet-600 text-white",
              "hover:from-blue-700 hover:to-violet-700 transition-all",
              "shadow-md shadow-blue-500/20",
            )}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Sign Up Free
          </Link>
          <Link
            href={signInHref}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium",
              "text-foreground hover:bg-[var(--matrx-glass-bg-hover)] transition-colors",
              "border border-border",
            )}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </Link>
        </div>

        <p className="text-[10px] text-muted-foreground/80 text-center mt-2">
          No credit card required
        </p>
      </div>
    </div>
  );
}
