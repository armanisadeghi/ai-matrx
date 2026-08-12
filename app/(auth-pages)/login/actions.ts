"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import {
  authDestinationOr,
  preserveAuthDestination,
  readAuthDestination,
} from "@/utils/auth/auth-destination";
import { stashGuestFingerprintForOAuth } from "@/lib/services/guest-oauth-transfer";

// Dynamic baseUrl that works with Vercel deployments (including preview branches)
const getBaseUrl = async () => {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  // Get the current request headers to determine the host
  const headersList = await headers();
  const host = headersList.get("host");

  if (host) {
    // Use the actual host from the request
    return `https://${host}`;
  }

  // Fallback to environment variables if no host header
  const vercelUrl =
    process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  const vercelBranchUrl =
    process.env.VERCEL_BRANCH_URL || process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;

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

  // The bound arg is the page's destination; the hidden field is the belt-and-
  // braces copy in case the binding is lost. Either may carry it — take the
  // first that survives validation.
  const redirectTo =
    readAuthDestination({ redirectTo: redirectToArg }) ??
    readAuthDestination(formData);

  console.log(
    `[${timestamp}] Login action - destination:`,
    redirectTo ?? "(none)",
  );

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };
  const { error } = await supabase.auth.signInWithPassword(data);
  if (error) {
    console.error(`[${timestamp}] Login error:`, error);
    // THE bug Arman reported: this used to rebuild the URL as
    // `/login?error=…` and nothing else, so ONE wrong password erased the
    // destination for the rest of the session. Wrong password now costs a
    // retry, never the destination.
    redirect(
      preserveAuthDestination(
        "/login",
        { redirectTo },
        {
          error: error.message,
        },
      ),
    );
  }

  // Gate PII (email) behind dev — matches the signup path below; never leak
  // user emails into production logs.
  if (process.env.NODE_ENV === "development") {
    console.log(`[${timestamp}] Login successful for:`, data.email);
  }
  revalidatePath("/", "layout");

  // authDestinationOr already refuses "/", "/login", "/sign-up" and every
  // other auth surface, so no hand-rolled blocklist is needed here.
  const finalRedirect = authDestinationOr({ redirectTo });

  // Success lands via a FULL-DOCUMENT navigation (see HardRedirectForm):
  // a soft redirect() here runs in a possibly-stale tab's old runtime and
  // 404s on the destination's chunks ("This page is out of date" on /welcome).
  return { hardRedirect: finalRedirect };
}

export async function signup(redirectToArg: string, formData: FormData) {
  const supabase = await createClient();
  const timestamp = new Date().toISOString();

  const redirectTo =
    readAuthDestination({ redirectTo: redirectToArg }) ??
    readAuthDestination(formData);

  console.log(
    `[${timestamp}] Signup action - destination:`,
    redirectTo ?? "(none)",
  );

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const Props = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { data, error } = await supabase.auth.signUp(Props);
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[${timestamp}] Signup result - User:`,
      data?.user?.email,
      "Error:",
      error,
    );
  }

  if (error) {
    console.error(`[${timestamp}] Signup error:`, error.message);
    redirect(
      preserveAuthDestination(
        "/sign-up",
        { redirectTo },
        {
          error: error.message,
        },
      ),
    );
  }

  revalidatePath("/", "layout");

  // authDestinationOr already refuses "/", "/login", "/sign-up" and every
  // other auth surface, so no hand-rolled blocklist is needed here.
  const finalRedirect = authDestinationOr({ redirectTo });

  // Full-document landing — see the note in login() above.
  return { hardRedirect: finalRedirect };
}

export async function loginWithGoogle(
  redirectToArg: string,
  formData?: FormData,
) {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const timestamp = new Date().toISOString();

  const redirectTo =
    readAuthDestination({ redirectTo: redirectToArg }) ??
    readAuthDestination(formData ?? null);

  console.log(`[${timestamp}] Google login - Environment debug:`);
  console.log("  NODE_ENV:", process.env.NODE_ENV);
  console.log("  VERCEL_URL:", process.env.VERCEL_URL);
  console.log("  VERCEL_BRANCH_URL:", process.env.VERCEL_BRANCH_URL);
  console.log("  NEXT_PUBLIC_VERCEL_URL:", process.env.NEXT_PUBLIC_VERCEL_URL);
  console.log(
    "  NEXT_PUBLIC_VERCEL_BRANCH_URL:",
    process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL,
  );
  const headersList = await headers();
  const host = headersList.get("host");
  console.log("  Request host:", host);
  console.log(`[${timestamp}] Google login - baseUrl:`, baseUrl);
  console.log(
    `[${timestamp}] Google login - destination:`,
    redirectTo ?? "(none)",
  );

  const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(authDestinationOr({ redirectTo }))}`;
  console.log(`[${timestamp}] Google login - OAuth callback URL:`, callbackUrl);

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open.
  await stashGuestFingerprintForOAuth(formData);
  // console.log(`[${timestamp}] 🚨 IMPORTANT: This URL must be whitelisted in Supabase Dashboard → Authentication → URL Configuration`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (data.url) {
    console.log(
      `[${timestamp}] Google login - Redirecting to OAuth provider:`,
      data.url,
    );
    redirect(data.url);
  }

  if (error) {
    console.error(`[${timestamp}] Google login error:`, error);
    redirect(
      preserveAuthDestination(
        "/login",
        { redirectTo },
        {
          error: "Google authentication failed. Please try again.",
        },
      ),
    );
  }
}

export async function loginWithGithub(
  redirectToArg: string,
  formData?: FormData,
) {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const timestamp = new Date().toISOString();

  const redirectTo =
    readAuthDestination({ redirectTo: redirectToArg }) ??
    readAuthDestination(formData ?? null);

  console.log(`[${timestamp}] GitHub login - baseUrl:`, baseUrl);
  console.log(
    `[${timestamp}] GitHub login - destination:`,
    redirectTo ?? "(none)",
  );

  const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(authDestinationOr({ redirectTo }))}`;
  console.log(`[${timestamp}] GitHub login - OAuth callback URL:`, callbackUrl);

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open.
  await stashGuestFingerprintForOAuth(formData);

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
    redirect(
      preserveAuthDestination(
        "/login",
        { redirectTo },
        {
          error: "GitHub authentication failed. Please try again.",
        },
      ),
    );
  }
}

export async function loginWithApple(
  redirectToArg: string,
  formData?: FormData,
) {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const timestamp = new Date().toISOString();

  const redirectTo =
    readAuthDestination({ redirectTo: redirectToArg }) ??
    readAuthDestination(formData ?? null);

  console.log(`[${timestamp}] Apple login - baseUrl:`, baseUrl);
  console.log(
    `[${timestamp}] Apple login - destination:`,
    redirectTo ?? "(none)",
  );

  const callbackUrl = `${baseUrl}/auth/callback?redirectTo=${encodeURIComponent(authDestinationOr({ redirectTo }))}`;
  console.log(`[${timestamp}] Apple login - OAuth callback URL:`);
  console.log(` -> ${callbackUrl}`);

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open.
  await stashGuestFingerprintForOAuth(formData);

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
    redirect(
      preserveAuthDestination(
        "/login",
        { redirectTo },
        {
          error: "Apple authentication failed. Please try again.",
        },
      ),
    );
  }
}
