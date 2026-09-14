// /sign-out — the confirmation page the mobile menu links to. (auth-pages)
// renders outside the app's Providers, so the identity is read here on the
// server and handed to the client button, which runs the one sign-out flow
// (device-scoped; a super admin is warned twice by name) —
// features/shell/auth/useSignOut.ts.

import Link from "next/link";
import { AuthMessageType } from "@/components/form-message";
import AuthPageContainer from "@/components/auth/auth-page-container";
import { SignOutConfirmButton } from "@/features/shell/auth/SignOutConfirmButton";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

interface SignOutProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignOut({ searchParams }: SignOutProps) {
    const awaitedSearchParams = await searchParams;
    const error = awaitedSearchParams.error as string;
    const success = awaitedSearchParams.success as string;

    let message: AuthMessageType | undefined;
    if (success) {
        message = { type: "success", message: success };
    } else if (error) {
        message = { type: "error", message: error };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return (
            <AuthPageContainer
                title="Sign Out"
                subtitle="You are not signed in on this device."
                message={message}
            >
                <div className="text-center">
                    <Link href="/login" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500">
                        Go to sign in
                    </Link>
                </div>
            </AuthPageContainer>
        );
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (user.email ? user.email.split("@")[0] : null) ||
        "User";
    const isSuperAdmin = await checkIsSuperAdmin(supabase, user.id);

    return (
        <AuthPageContainer
            title="Sign Out"
            subtitle="Are you sure you want to sign out?"
            message={message}
        >
            <div className="space-y-6">
                <p className="text-center text-gray-600 dark:text-gray-400">
                    You are signed in as {user.email ?? name} on this device. Signing out ends this device&apos;s session only. You can always sign back in anytime.
                </p>
                <SignOutConfirmButton identity={{ isSuperAdmin, name, email: user.email ?? null }} />
                <div className="text-center">
                    <Link href="/dashboard" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500" tabIndex={-1}>
                        Cancel and return to dashboard
                    </Link>
                </div>
            </div>
        </AuthPageContainer>
    );
}
