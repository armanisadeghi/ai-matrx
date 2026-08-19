"use client";

import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loginHref,
  signUpHref as signUpHref_,
} from "@/utils/auth/auth-destination";

interface InlineConversionCardProps {
  /** Headline on the card. */
  heading: string;
  /** Subhead — one line, conversational. */
  description: string;
  className?: string;
}

/**
 * Inline content-grade signup card. Designed to drop into the body of a
 * landing or surface as if it were one of the content sections — gradient
 * border, polite copy, dual CTAs. Always preserves the auth destination.
 *
 * Mounting is the caller's responsibility (see
 * `ModuleLandingConversionNudges` for the rule that fires this after the
 * guest has visited a few surfaces).
 */
export function InlineConversionCard({
  heading,
  description,
  className,
}: InlineConversionCardProps) {
  // `redirectTo` is the ONE param we write — `returnUrl` is a read-only
  // legacy alias (utils/auth/auth-destination.ts), and hand-building it here
  // skipped the destination validation every other auth surface applies.
  const destination =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : null;
  const signUpHref = signUpHref_(destination);
  const signInHref = loginHref(destination);

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl px-4 sm:px-6 my-12",
        className,
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl p-6 sm:p-8 overflow-hidden",
          "bg-gradient-to-br from-blue-500/10 via-violet-500/10 to-transparent",
          "border border-primary/20",
        )}
      >
        <div
          aria-hidden
          className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
        />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <UserPlus className="h-6 w-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              {heading}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
            <Link
              href={signUpHref}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-sm font-semibold",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                "whitespace-nowrap",
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Free Account
            </Link>
            <Link
              href={signInHref}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-sm font-medium",
                "text-foreground hover:bg-muted transition-colors",
                "border border-border whitespace-nowrap",
              )}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
