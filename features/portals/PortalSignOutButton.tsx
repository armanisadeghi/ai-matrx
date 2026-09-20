"use client";

// Sign out, through THE ONE sign-out primitive (`features/shell/auth/useSignOut`)
// — device-scoped, never the Supabase client's global sign-out, which would end
// every session the account holds on every device.
//
// Where it goes afterwards is this portal's own sign-in panel, not `/login`: the
// person here has no AI Matrx account in any ordinary sense, and the generic
// login page would be a door that leads nowhere she can go.

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportSignOutFailure, useSignOut } from "@/features/shell/auth/useSignOut";

export function PortalSignOutButton({
  slug,
  label = "Sign out",
  variant = "ghost",
}: {
  slug: string;
  label?: string;
  variant?: "ghost" | "outline" | "default";
}) {
  const signOut = useSignOut();
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="h-9 gap-1.5"
      onClick={() =>
        signOut({ redirectTo: `/portal/c/${encodeURIComponent(slug)}` }).catch(
          reportSignOutFailure,
        )
      }
    >
      <LogOut className="h-4 w-4" />
      {label}
    </Button>
  );
}
