// File: app/auth/confirm/route.ts

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { safeRelativePath } from "@/utils/auth/safe-redirect";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const defaultRedirect = type === "recovery" ? "/reset-password" : "/dashboard";
    const redirectTo = safeRelativePath(searchParams.get("redirectTo"), defaultRedirect);

    if (process.env.NODE_ENV === "development") {
        console.log("Email confirmation attempt:");
        console.log("  token_hash:", token_hash ? "present" : "missing");
        console.log("  type:", type);
        console.log("  redirectTo:", redirectTo);
    }

    if (token_hash && type) {
        const supabase = await createClient();

        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });

        if (!error) {
            // redirect user to specified redirect URL with success message
            const successUrl = `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}success=${encodeURIComponent('Email confirmed! Welcome to AI Matrx!')}`;
            redirect(successUrl);
        } else {
            console.error("Email confirmation failed:", error);
        }
    }

    // redirect to error page, preserving redirectTo if different from default
    const errorUrl = `/error${redirectTo !== "/dashboard" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`;
    redirect(errorUrl);
}
