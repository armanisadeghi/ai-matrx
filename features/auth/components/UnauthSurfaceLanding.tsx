"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { UserPlus, LogIn, Lock } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UnauthSurfaceLandingProps {
  /** Name of the surface (e.g. "Files", "Notes") — surfaced in the headline. */
  featureName: string;
  /** One-line description of the surface. */
  description?: string;
  /** Optional Lucide icon shown above the headline. Defaults to `Lock`. */
  icon?: LucideIcon;
  /** Optional bullet list of what the surface enables once signed in. */
  bullets?: string[];
  /** Authed-user fallback. When the visitor is signed in, render this instead. */
  children?: ReactNode;
}

/**
 * Full-page friendly empty state shown to unauthenticated visitors on
 * core surfaces where the live UI would be useless (no data, immediate
 * 401s). Mirrors the `AuthGateDialog` voice so the conversion experience
 * is coherent across menus, dialogs, and pages.
 *
 * If the visitor is signed in, simply renders `children` (the live UI).
 * If not, renders the conversion card with sign-up + sign-in CTAs that
 * preserve the current URL via `returnUrl`.
 */
export function UnauthSurfaceLanding({
  featureName,
  description,
  icon: Icon = Lock,
  bullets,
  children,
}: UnauthSurfaceLandingProps) {
  // Redux is hydrated from `(core)/layout.tsx`'s server-side `getUser()`
  // (the preloaded state lands `id: null` for guests), so this selector
  // returns the correct value during both SSR and the client's first
  // render — no mounted gate or hydration dance required for `(core)`.
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const returnUrl =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : "";
  const signUpHref = `/sign-up${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;
  const signInHref = `/login${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className={cn(
          "w-full max-w-md rounded-2xl p-6 sm:p-8",
          "bg-card border border-border shadow-xl",
        )}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center mb-4",
              "bg-gradient-to-br from-blue-500/15 to-violet-500/15",
              "border border-blue-500/20 dark:border-violet-500/20",
            )}
          >
            <Icon className="w-7 h-7 text-primary" aria-hidden="true" />
          </div>

          <h2 className="text-lg sm:text-xl font-semibold text-foreground">
            Sign in to use {featureName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            {description ??
              `Create a free account to unlock ${featureName}. Your work stays with you.`}
          </p>

          {bullets && bullets.length > 0 && (
            <ul className="text-left text-sm text-muted-foreground mt-4 space-y-1.5 w-full max-w-xs">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span
                    className="inline-block w-1 h-1 rounded-full bg-primary mt-2 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 w-full max-w-[260px] mt-5">
            <Link
              href={signUpHref}
              className={cn(
                "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-semibold",
                "bg-gradient-to-r from-blue-600 to-violet-600 text-white",
                "hover:from-blue-700 hover:to-violet-700 transition-all",
                "shadow-md shadow-blue-500/20",
              )}
            >
              <UserPlus className="w-4 h-4" />
              Create Free Account
            </Link>
            <Link
              href={signInHref}
              className={cn(
                "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-medium",
                "text-foreground hover:bg-[var(--matrx-glass-bg-hover)] transition-colors",
                "border border-border",
              )}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/80 mt-3">
            No credit card required
          </p>
        </div>
      </div>
    </div>
  );
}
