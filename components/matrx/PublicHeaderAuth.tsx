"use client";

import { Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogIn } from "lucide-react";
import { useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  selectUser,
  selectDisplayName,
  selectProfilePhoto,
} from "@/lib/redux/slices/userSlice";
import { selectIsSuperAdminPerson } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import { PUBLIC_HEADER_ICON_BUTTON } from "./publicHeaderChrome";
// THE package initials formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). Recorded display decision: a multi-part name takes FIRST +
// LAST, so "Ana Maria Rivera" is AR — this surface previously took first +
// second and printed "AM".
import { getInitials } from "@ai-matrx/kit/format";

// Lazy load AdminMenu - only loads when user is admin
const AdminMenu = lazy(() => import("./AdminMenu"));

/**
 * Public Header Auth - Redux-powered
 *
 * Reads auth state from Redux (populated by GlobalAuthSync).
 * No direct Supabase calls - single source of truth.
 *
 * Shows:
 * - Sign In button for guests and unauthenticated visitors
 * - User avatar + Dashboard button for non-anonymous account users
 * - AdminMenu dropdown for admin users (lazy loaded)
 */
export function PublicHeaderAuth() {
  const loginHref = useLoginHref();
  const user = useSelector(selectUser);
  const displayName = useSelector(selectDisplayName);
  const profilePhoto = useSelector(selectProfilePhoto);
  // ADMIN IDENTITY: the admin menu is the way INTO the admin section.
  const isAdmin = useSelector(selectIsSuperAdminPerson);
  const router = useRouter();

  // Avoid hydration mismatch: GlobalAuthSync populates the user slice after
  // mount, so the very first client render must match the server's render
  // (always unauthenticated). After mount we honor the real Redux state.
  // Without this gate, the server emits the Sign In <Button> and the client's
  // first render emits the authed <div>, which triggers React's hydration
  // error and unmounts the entire subtree.
  const mounted = useIsMounted();

  const isAuthenticated = mounted && !!user.id && !user.isAnonymous;

  // Calculate initials for avatar fallback
  const initials = getInitials(displayName);

  // If authenticated, show user info + dashboard button
  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-1.5">
        {/* Admin Menu - Lazy loaded, only for admins */}
        {isAdmin && (
          <Suspense fallback={<div className="w-16 h-7" />}>
            <AdminMenu />
          </Suspense>
        )}

        {/* User Avatar - Hidden on mobile */}
        <div className="hidden md:flex items-center gap-1.5 p-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <Avatar className="h-5 w-5">
            <AvatarImage src={profilePhoto || undefined} alt={displayName} />
            <AvatarFallback className="text-[10px] bg-gradient-to-r from-blue-600 to-violet-600 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Dashboard Button */}
        <Button
          icon={<LayoutDashboard />}
          variant="primary"
          onClick={() => router.push("/dashboard")}
          aria-label="Open dashboard"
          className={PUBLIC_HEADER_ICON_BUTTON}
        />
      </div>
    );
  }

  // Not authenticated - show sign in button
  return (
    <Button
      icon={<LogIn />}
      variant="primary"
      onClick={() => router.push(loginHref)}
      aria-label="Sign in"
      className={cn(PUBLIC_HEADER_ICON_BUTTON, "sm:w-auto")}
    >
      <span className="hidden sm:inline">Sign In</span>
    </Button>
  );
}
