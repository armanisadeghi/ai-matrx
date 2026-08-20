"use client";

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

interface GuestLimitWarningProps {
  remaining: number;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Warning shown to guests after 3 executions
 * Gentle reminder to sign up for continued access
 */
export function GuestLimitWarning({
  remaining,
  onDismiss,
  className,
}: GuestLimitWarningProps) {
  const signUpHref = useLoginHref("/sign-up");
  if (remaining > 2 || remaining < 0) {
    return null;
  }

  return (
    <Alert
      variant="default"
      className={`border-orange-500 bg-orange-50 dark:bg-orange-950 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-sm text-orange-900 dark:text-orange-100">
            <span className="font-semibold">
              {remaining === 0
                ? "Last free run!"
                : `${remaining} free run${remaining === 1 ? "" : "s"} left`}
            </span>
            {" — "}
            <Link
              href={signUpHref}
              className="underline hover:no-underline font-medium"
            >
              Sign up for free
            </Link>{" "}
            to continue with unlimited access.
          </AlertDescription>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="flex-shrink-0 h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}
