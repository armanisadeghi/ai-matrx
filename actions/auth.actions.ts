// File: actions/auth.actions.ts

"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { promoteGuestToUser } from "@/lib/services/guest-promotion";
import { stashGuestFingerprintForOAuth } from "@/lib/services/guest-oauth-transfer";
import {
  authDestinationOr,
  normalizeAuthDestination,
  readAuthDestination,
  withAuthDestination,
} from "@/utils/auth/auth-destination";

export async function signUpAction(
  formData: FormData,
): Promise<{ hardRedirect: string } | void> {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  const supabase = await createClient();

  const origin = (await headers()).get("origin");
  const safeRedirectTo = authDestinationOr(formData);

  if (process.env.NODE_ENV === "development") {
    console.log("SignUpAction - RedirectTo:", safeRedirectTo);
    console.log("SignUpAction - Origin:", origin);
  }

  if (!email || !password || !confirmPassword) {
    console.error("SignUpAction - Missing required fields");
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email, password, and password confirmation are required",
      formData,
    );
  }

  if (password !== confirmPassword) {
    console.error("SignUpAction - Password mismatch");
    return encodedRedirect(
      "error",
      "/sign-up",
      "Passwords do not match",
      formData,
    );
  }

  if (password.length < 6) {
    console.error("SignUpAction - Password too short");
    return encodedRedirect(
      "error",
      "/sign-up",
      "Password must be at least 6 characters long",
      formData,
    );
  }

  // Guest → user in-place promotion. If this visitor created files /
  // conversations as a guest, their work is owned by a server-minted
  // anonymous auth UUID (keyed off the browser fingerprint). Promoting that
  // SAME UUID to a real account keeps every guest-owned row. A fresh signUp()
  // would mint a new UUID and silently orphan all of it.
  const guestFingerprint = formData.get("guestFingerprint")?.toString();
  if (guestFingerprint) {
    const promotion = await promoteGuestToUser({
      fingerprint: guestFingerprint,
      email,
      password,
    });

    if (promotion.promoted) {
      // Account is real + email already confirmed. Sign them in on the
      // cookie-bound SSR client (same UUID → all their work is theirs) and
      // skip the email-confirmation gate entirely.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        console.error(
          "SignUpAction - promotion ok but auto sign-in failed:",
          signInError.message,
        );
        return encodedRedirect(
          "success",
          "/login",
          "Your account is ready. Please sign in to continue.",
          formData,
        );
      }
      if (process.env.NODE_ENV === "development") {
        console.log("SignUpAction - guest promoted in place, signed in");
      }
      // Full-document landing (see HardRedirectForm) — a soft redirect() in a
      // stale tab 404s on the destination's chunks.
      return { hardRedirect: safeRedirectTo };
    }

    if (promotion.promoted === false && promotion.reason === "email_in_use") {
      return encodedRedirect(
        "error",
        "/sign-up",
        "That email already has an account. Please sign in instead.",
        formData,
      );
    }
    // no_guest / already_converted / not_anonymous / error → fall through to
    // the normal sign-up path below.
  }

  // Use the confirm URL for email verification (PKCE flow)
  const confirmUrl = `${origin}/auth/confirm?redirectTo=${encodeURIComponent(safeRedirectTo)}`;

  // Test Supabase connection first
  try {
    const { data: testData, error: testError } =
      await supabase.auth.getSession();
    if (process.env.NODE_ENV === "development") {
      console.log("SignUpAction - Connection test result:", {
        testData: !!testData,
        testError: !!testError,
      });
    }
  } catch (connError) {
    console.error("SignUpAction - Connection test failed:", connError);
    return encodedRedirect(
      "error",
      "/sign-up",
      "Unable to connect to authentication service. Please try again later.",
      formData,
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl,
    },
  });

  if (error) {
    console.error("SignUpAction - Auth error:", error.code, error.message);

    // Handle specific error types
    if (error.status === 504) {
      // For email signup, a 504 might mean the user was created but email sending timed out
      // Check if we have user data despite the timeout
      if (data.user) {
        return encodedRedirect(
          "success",
          "/sign-up",
          "Account created! Please check your email for a verification link. If you don't receive it in a few minutes, try signing up again.",
          formData,
        );
      }
      return encodedRedirect(
        "error",
        "/sign-up",
        "Email service is currently slow. Your account may have been created - please check your email or try again in a few minutes.",
        formData,
      );
    }

    if (error.code) {
      return encodedRedirect(
        "error",
        "/sign-up",
        error.message || "Authentication error occurred",
        formData,
      );
    }

    // Fallback for unknown errors
    return encodedRedirect(
      "error",
      "/sign-up",
      "An unexpected error occurred. Please try again.",
      formData,
    );
  }

  // For email signup with confirmation enabled, data.user will exist but data.session will be null
  // This is expected behavior - the user needs to confirm their email first
  if (data.user && !data.session) {
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link.",
      formData,
    );
  }

  // If we have both user and session, the user is immediately signed in (confirmation disabled)
  if (data.user && data.session) {
    // Full-document landing (see HardRedirectForm).
    return { hardRedirect: safeRedirectTo };
  }

  // If we get here, something unexpected happened
  console.error(
    "SignUpAction - Unexpected response: no user or session returned",
  );
  return encodedRedirect(
    "error",
    "/sign-up",
    "Signup failed. Please try again.",
    formData,
  );
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const safeRedirectTo = authDestinationOr(formData);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message, formData);
  }

  // Full-document landing (see HardRedirectForm).
  return { hardRedirect: safeRedirectTo };
}

export async function signInWithGoogleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  // NOTE: `redirectTo` is intentionally NOT validated here — it never reaches a
  // bare redirect() in this function. It is carried as a query param into the
  // trusted /auth/callback route, which re-validates it via safeRelativePath
  // before redirecting. Do NOT wrap callbackUrl in safeRelativePath (it is an
  // absolute provider-callback URL and that would break the OAuth flow).
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.error("signInWithGoogleAction OAuth error:", error.message);
    return encodedRedirect("error", "/login", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/login",
    "Failed to initiate Google sign-in",
    formData,
  );
}

export async function signInWithGithubAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/login",
    "Failed to initiate GitHub sign-in",
    formData,
  );
}

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const formCallbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Email is required",
      formData,
    );
  }

  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin ?? undefined;
  const resetCallbackUrl = new URL("/auth/callback", siteOrigin);
  // THE LONGEST HOP IN THE FLOW. The user leaves the browser entirely, opens an
  // email, and comes back through /auth/callback. Their destination has to ride
  // inside the emailed link or it is gone forever — which is exactly what used
  // to happen: this was hardcoded to a bare "/reset-password". We nest the
  // destination onto the reset page, so the chain is:
  //   /auth/callback?redirectTo=/reset-password?redirectTo=/tasks
  // → /reset-password?redirectTo=/tasks → (password set) → /tasks
  resetCallbackUrl.searchParams.set(
    "redirectTo",
    encodeURIComponent(
      withAuthDestination("/reset-password", readAuthDestination(formData)),
    ),
  );

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetCallbackUrl.toString(),
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
      formData,
    );
  }

  // Only follow same-site relative paths — never an attacker-controlled
  // absolute URL from the form (open-redirect / phishing vector).
  const safeCallback = formCallbackUrl
    ? (normalizeAuthDestination(formCallbackUrl) ?? "")
    : "";
  if (safeCallback) {
    return redirect(safeCallback);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a password reset link.",
    formData,
  );
}

export async function resetPasswordAction(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return encodedRedirect(
      "error",
      "/reset-password",
      "Password and confirm password are required",
      formData,
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      "/reset-password",
      "Passwords do not match",
      formData,
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    return encodedRedirect(
      "error",
      "/reset-password",
      "Password update failed",
      formData,
    );
  }

  // The password is set and the recovery session is live — this user IS signed
  // in. Land them on what they originally asked for. Previously this returned
  // them to /reset-password with a success banner: a dead end at the exact
  // moment they had finally earned their destination.
  const destination = authDestinationOr(formData);
  return redirect(
    `${destination}${destination.includes("?") ? "&" : "?"}success=${encodeURIComponent("Password updated")}`,
  );
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/login");
}

export async function signUpWithGoogleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate Google sign-up",
    formData,
  );
}

export const signUpWithGithubAction = async (formData: FormData) => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate GitHub sign-up",
    formData,
  );
};

export async function signInWithAppleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/login",
    "Failed to initiate Apple sign-in",
    formData,
  );
}

export const signUpWithAppleAction = async (formData: FormData) => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? undefined;
  const redirectTo = authDestinationOr(formData);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  // D20: carry the guest fingerprint across the OAuth provider round-trip so
  // /auth/callback can transfer guest-owned data onto the account. Fail-open:
  // any failure just means a normal OAuth login with no transfer.
  await stashGuestFingerprintForOAuth(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message, formData);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate Apple sign-up",
    formData,
  );
};
