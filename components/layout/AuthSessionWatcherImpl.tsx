"use client";

/**
 * Auth Session Watcher — heavy body (Impl).
 *
 * Renders the full-screen blocking overlay for the two auth-safety stops:
 * - `expired`: the session signed out ("Session Expired").
 * - `identity-changed`: the auth cookie under this tab now belongs to a
 *   DIFFERENT user than the one the app booted as (a login in another tab
 *   of this browser profile rotated the domain-wide cookie). The only safe
 *   action is a reload — continuing would attribute writes to the wrong
 *   account or have them silently rejected by RLS, which is how 14 hours of
 *   note edits were lost on 2026-08-08.
 *
 * Lazy-loaded by `AuthSessionWatcher.tsx` ONLY when one of the stops fires,
 * so the modal's dep graph never enters the static graph of any route.
 */

import { useRouter } from "next/navigation";
import { LogIn, AlertTriangle, RefreshCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthSessionWatcherImplProps {
  variant: "expired" | "identity-changed";
  newEmail?: string;
  /**
   * How many unsaved items were snapshotted to local drafts before this
   * overlay went up. The reload used to be a guaranteed loss of the in-memory
   * buffer (D132) — when we rescued something, say so, or the user has every
   * reason to refuse to reload.
   */
  rescuedDraftCount?: number;
}

export default function AuthSessionWatcherImpl({
  variant,
  newEmail,
  rescuedDraftCount = 0,
}: AuthSessionWatcherImplProps) {
  const router = useRouter();

  if (variant === "identity-changed") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
            <UserX className="w-8 h-8 text-destructive" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Account Changed
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This browser is now signed in as{" "}
              <span className="font-medium text-foreground">
                {newEmail ?? "a different account"}
              </span>
              , but this tab was opened under another account. To protect your
              data, this tab has been paused — anything saved now could be lost
              or attributed to the wrong account. Reload to continue as the
              current account.
            </p>
            {rescuedDraftCount > 0 && (
              <p className="text-sm text-foreground leading-relaxed">
                {rescuedDraftCount === 1
                  ? "Your unsaved change was kept"
                  : `Your ${rescuedDraftCount} unsaved changes were kept`}{" "}
                in this browser. Sign back in as the original account and open
                the record — you will be offered the recovered version.
              </p>
            )}
          </div>

          <Button
            onClick={() => window.location.reload()}
            className="w-full gap-2"
            size="lg"
          >
            <RefreshCw className="w-4 h-4" />
            Reload This Tab
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning/10">
          <AlertTriangle className="w-8 h-8 text-warning" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Session Expired
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your session has timed out. Please sign in again to continue — your
            work is saved.
          </p>
        </div>

        <Button
          onClick={() => router.push("/login")}
          className="w-full gap-2"
          size="lg"
        >
          <LogIn className="w-4 h-4" />
          Sign In Again
        </Button>
      </div>
    </div>
  );
}
