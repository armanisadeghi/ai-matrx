"use client";

import { useCallback } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { MENU_ITEM_CLASS } from "./menuItemClass";

export function SignOutMenuItem() {
    const handleClick = useCallback(async () => {
        const { supabase } = await import("@/utils/supabase/client");
        const { activeOrgCookie } = await import("@/lib/organizations/activeOrgCookie");
        // Forget the shared active-organization cookie outright on an EXPLICIT
        // sign-out (it is identity-keyed anyway) so the next person on this
        // browser inherits nothing — on every Matrx surface of the apex.
        activeOrgCookie.clear();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }, []);

    return (
        <label htmlFor="shell-user-menu" className="block">
            <button
                className={cn(MENU_ITEM_CLASS, "text-destructive [&_svg]:text-destructive")}
                onClick={handleClick}
            >
                <LogOut />
                Sign Out
            </button>
        </label>
    );
}
