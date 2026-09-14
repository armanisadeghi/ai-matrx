"use client";

import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSignOut, reportSignOutFailure } from "@/features/shell/auth/useSignOut";
import { MENU_ITEM_CLASS } from "./menuItemClass";

// The one sign-out primitive (device-scoped, super admins warned twice by
// name) lives in features/shell/auth/useSignOut.ts — never call
// the Supabase client's sign-out from a control directly.
export function SignOutMenuItem() {
    const signOut = useSignOut();

    return (
        <label htmlFor="shell-user-menu" className="block">
            <button
                className={cn(MENU_ITEM_CLASS, "text-destructive [&_svg]:text-destructive")}
                onClick={() => signOut().catch(reportSignOutFailure)}
            >
                <LogOut />
                Sign Out
            </button>
        </label>
    );
}
