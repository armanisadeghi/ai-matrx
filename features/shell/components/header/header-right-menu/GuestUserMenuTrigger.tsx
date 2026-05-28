import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avatar-slot replacement for unauthenticated visitors. The primary
 * gradient pill ("Sign Up") opens the guest user menu via the same
 * hidden checkbox toggle (`#shell-user-menu`) that the authenticated
 * trigger uses, so the panel/backdrop wiring is identical. An adjacent
 * "Sign In" link is shown on `sm+` viewports and routes straight to
 * `/login` (no menu intermediary).
 *
 * Footprint matches `UserMenuTrigger` (h-11 wrapper, 32 × 32 inner) so
 * the header layout stays pixel-stable across auth states.
 */
export default function GuestUserMenuTrigger() {
  return (
    <div className="flex items-center gap-1.5 h-11 pr-1">
      <Link
        href="/login"
        className={cn(
          "hidden sm:inline-flex items-center h-7 px-2 rounded-md text-xs font-medium",
          "text-foreground hover:bg-[var(--matrx-glass-bg-hover)] transition-colors",
        )}
      >
        <LogIn className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
        Sign In
      </Link>

      <label
        htmlFor="shell-user-menu"
        aria-label="Sign up menu"
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-full cursor-pointer outline-none transition-all",
          "bg-gradient-to-r from-blue-600 to-violet-600 text-white text-xs font-semibold",
          "hover:from-blue-700 hover:to-violet-700",
          "shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30",
          "active:scale-95",
        )}
      >
        <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
        Sign Up
      </label>
    </div>
  );
}
