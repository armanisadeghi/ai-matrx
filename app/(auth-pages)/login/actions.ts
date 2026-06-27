"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { safeRelativePath } from "@/utils/auth/safe-redirect";

// Dynamic baseUrl that works with Vercel deployments (including preview branches)
const getBaseUrl = async () => {
    if (process.env.NODE_ENV === "development") {
        return "http://localhost:3000";
    }

    // Get the current request headers to determine the host
    const headersList = await headers();
    const host = headersList.get('host');

    if (host) {
        // Use the actual host from the request
        return `https://${host}`;
    }

    // Fallback to environment variables if no host header
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    const vercelBranchUrl = process.env.VERCEL_BRANCH_URL || process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;

    const deploymentUrl = vercelBranchUrl || vercelUrl;

    if (deploymentUrl) {
        return `https://${deploymentUrl}`;
    }

    // Final fallback to production domain
    return "https://aimatrx.com";
};

export async function login(redirectToArg: string, formData: FormData) {
    const supabase = await createClient();
    const timestamp = new Date().toISOString();

    // Get redirectTo from either the function arg or the form data
    // This provides a fallback in case the function binding doesn't work
    let redirectTo = redirectToArg;
    const formRedirectTo = formData.get("redirectTo");
    if (!redirectTo && formRedirectTo && typeof formRedirectTo === 'string') {
        redirectTo = formRedirectTo;
    }

    console.log(`[${timestamp}] Login action - incoming redirectTo:`, redirectToArg);
    console.log(`[${timestamp}] Login action - form redirectTo:`, formRedirectTo);
    console.log(`[${timestamp}] Login action - combined redirectTo:`, redirectTo);

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const data = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    };
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) {
        console.error(`[${timestamp}] Login error:`, error);
        redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    console.log(`[${timestamp}] Login successful for:`, data.email);
    revalidatePath("/", "layout");

    // CRITICAL: Never redirect to homepage, login, or sign-up after successful login
    // This prevents infinite redirect loops and ensures users always land on a protected page.
    // safeRelativePath also blocks open-redirect to an off-site absolute URL.
    let finalRedirect = safeRelativePath(redirectTo, "/dashboard");
    if (finalRedirect === '/' || finalRedirect === '/login' || finalRedirect === '/sign-up') {
        finalRedirect = '/dashboard';
    }

    // Redirect to the original URL if available, otherwise to dashboard
    redirect(finalRedirect);
}

export async function signup(redirectToArg: string, formData: FormData) {
    const supabase = await createClient();
    const timestamp = new Date().toISOString();

    // Get redirectTo from either the function arg or the form data
    let redirectTo = redirectToArg;
    const formRedirectTo = formData.get("redirectTo");
    if (!redirectTo && formRedirectTo && typeof formRedirectTo === 'string') {
        redirectTo = formRedirectTo;
    }

    console.log(`[${timestamp}] Signup action - redirectTo:`, redirectTo);

    // type-casting here for convenience
    // in practice, you should validate your inputs
    const Props = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    };

    const { data, error } = await supabase.auth.signUp(Props);
    if (process.env.NODE_ENV === "development") {
        console.log(`[${timestamp}] Signup result - User:`, data?.user?.email, 'Error:', error);
    }

    if (error) {
        console.error(`[${timestamp}] Signup error:`, error.message);
        redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/", "layout");

    // CRITICAL: Never redirect to homepage, login, or sign-up after successful signup.
    // safeRelativePath also blocks open-redirect to an off-site absolute URL.
    let finalRedirect = safeRelativePath(redirectTo, "/dashboard");
    if (finalRedirect === '/' || finalRedirect === '/login' || finalRedirect === '/sign-up') {
        finalRedirect = '/dashboard';
    }

    // Redirect to the original URL if available, otherwise to dashboard
    redirect(finalRedirect);
}

export async function loginWithGoogle(redirectToArg: string, formData?: FormData) {
    const supabase = await createClient();
    const baseUrl = await getBaseUrl();
    const timestamp = new Date().toISOString();

    // Get redirectTo from either the function arg or the form data
    let redirectTo = redirectToArg;
    if (formData) {
        const formRedirectTo = formData.get("redirectTo");
        if (!redirectTo && formRedirectTo && typeof formRedirectTo === 'string') {
            redirectTo = formRedirectTo;
        }
    }

    // CRITICAL: Never pass homepage, login, or sign-up as redirectTo
    // This prevents OAuth callback from redirecting to public pages after successful auth
    if (redirectTo === '/' || redirectTo === '/login' || redirectTo === '/sign-up' || redirectTo === '') {
        console.log(`[${timestamp}] Google login - Invalid redirectTo (${redirectTo}), using /dashboard`);
        redirectTo = '/dashboard';
    }

    console.log(`[${timestamp}] Google login - Environment debug:`);
    console.log("  NODE_ENV:", process.env.NODE_ENV);
    console.log("  VERCEL_URL:", process.env.VERCEL_URL);
    console.log("  VERCEL_BRANCH_URL:", process.env.VERCEL_BRANCH_URL);
    console.log("  NEXT_PUBLIC_VERCEL_URL:", process.env.NEXT_PUBLIC_VERCEL_URL);
    console.log("  NEXT_PUBLIC_VERCEL_BRANCH_URL:", process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL);
    const headersList = await headers();
    const host = headersList.get('host');
    console.log("  Request host:", host);
    console.log(`[${timestamp}] Google login - baseUrl:`, baseUrl);
    console.log(`[${timestamp}] Google login - final redirectTo:`, redirectTo);

    const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
    console.log(`[${timestamp}] Google login - OAuth callback URL:`, callbackUrl);
    // console.log(`[${timestamp}] 🚨 IMPORTANT: This URL must be whitelisted in Supabase Dashboard → Authentication → URL Configuration`);

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: callbackUrl,
        },
    });

    if (data.url) {
        console.log(`[${timestamp}] Google login - Redirecting to OAuth provider:`, data.url);
        redirect(data.url);
    }

    if (error) {
        console.error(`[${timestamp}] Google login error:`, error);
        redirect(`/login?error=${encodeURIComponent('Google authentication failed. Please try again.')}`);
    }
}

export async function loginWithGithub(redirectToArg: string, formData?: FormData) {
    const supabase = await createClient();
    const baseUrl = await getBaseUrl();
    const timestamp = new Date().toISOString();

    // Get redirectTo from either the function arg or the form data
    let redirectTo = redirectToArg;
    if (formData) {
        const formRedirectTo = formData.get("redirectTo");
        if (!redirectTo && formRedirectTo && typeof formRedirectTo === 'string') {
            redirectTo = formRedirectTo;
        }
    }

    // CRITICAL: Never pass homepage, login, or sign-up as redirectTo
    // This prevents OAuth callback from redirecting to public pages after successful auth
    if (redirectTo === '/' || redirectTo === '/login' || redirectTo === '/sign-up' || redirectTo === '') {
        console.log(`[${timestamp}] GitHub login - Invalid redirectTo (${redirectTo}), using /dashboard`);
        redirectTo = '/dashboard';
    }

    console.log(`[${timestamp}] GitHub login - baseUrl:`, baseUrl);
    console.log(`[${timestamp}] GitHub login - final redirectTo:`, redirectTo);

    const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
    console.log(`[${timestamp}] GitHub login - OAuth callback URL:`, callbackUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
            redirectTo: callbackUrl,
        },
    });

    if (data.url) {
        console.log(`[${timestamp}] GitHub login - Redirecting to OAuth provider:`);
        console.log(` -> ${data.url}`);
        redirect(data.url);
    }

    if (error) {
        console.error(`[${timestamp}] GitHub login error:`, error);
        redirect(`/login?error=${encodeURIComponent('GitHub authentication failed. Please try again.')}`);
    }
}

export async function loginWithApple(redirectToArg: string, formData?: FormData) {
    const supabase = await createClient();
    const baseUrl = await getBaseUrl();
    const timestamp = new Date().toISOString();

    // Get redirectTo from either the function arg or the form data
    let redirectTo = redirectToArg;
    if (formData) {
        const formRedirectTo = formData.get("redirectTo");
        if (!redirectTo && formRedirectTo && typeof formRedirectTo === 'string') {
            redirectTo = formRedirectTo;
        }
    }

    // CRITICAL: Never pass homepage, login, or sign-up as redirectTo
    if (redirectTo === '/' || redirectTo === '/login' || redirectTo === '/sign-up' || redirectTo === '') {
        console.log(`[${timestamp}] Apple login - Invalid redirectTo (${redirectTo}), using /dashboard`);
        redirectTo = '/dashboard';
    }

    console.log(`[${timestamp}] Apple login - baseUrl:`, baseUrl);
    console.log(`[${timestamp}] Apple login - final redirectTo:`, redirectTo);

    const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
    console.log(`[${timestamp}] Apple login - OAuth callback URL:`);
    console.log(` -> ${callbackUrl}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
            redirectTo: callbackUrl,
        },
    });

    if (data.url) {
        console.log(`[${timestamp}] Apple login - Redirecting to OAuth provider:`);
        console.log(` -> ${data.url}`);
        redirect(data.url);
    }

    if (error) {
        console.error(`[${timestamp}] Apple login error:`, error);
        redirect(`/login?error=${encodeURIComponent('Apple authentication failed. Please try again.')}`);
    }
}
