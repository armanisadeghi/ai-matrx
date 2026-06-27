// File: actions/auth.actions.ts

"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { promoteGuestToUser } from "@/lib/services/guest-promotion";

export async function signUpAction(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  const supabase = await createClient();

  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  console.log("SignUpAction - Email:", email);
  console.log("SignUpAction - RedirectTo:", redirectTo);
  console.log("SignUpAction - Origin:", origin);

  if (!email || !password || !confirmPassword) {
    console.error("SignUpAction - Missing required fields");
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email, password, and password confirmation are required",
    );
  }

  if (password !== confirmPassword) {
    console.error("SignUpAction - Password mismatch");
    return encodedRedirect("error", "/sign-up", "Passwords do not match");
  }

  if (password.length < 6) {
    console.error("SignUpAction - Password too short");
    return encodedRedirect(
      "error",
      "/sign-up",
      "Password must be at least 6 characters long",
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
        );
      }
      console.log(
        "SignUpAction - guest promoted in place, signed in:",
        promotion.userId,
      );
      return redirect(redirectTo);
    }

    if (promotion.promoted === false && promotion.reason === "email_in_use") {
      return encodedRedirect(
        "error",
        "/sign-up",
        "That email already has an account. Please sign in instead.",
      );
    }
    // no_guest / already_converted / not_anonymous / error → fall through to
    // the normal sign-up path below.
  }

  // Use the confirm URL for email verification (PKCE flow)
  const confirmUrl = `${origin}/auth/confirm?redirectTo=${encodeURIComponent(redirectTo)}`;
  console.log("SignUpAction - Using confirm URL:", confirmUrl);

  // Test Supabase connection first
  try {
    console.log("SignUpAction - Testing Supabase connection...");
    const { data: testData, error: testError } =
      await supabase.auth.getSession();
    console.log("SignUpAction - Connection test result:", {
      testData: !!testData,
      testError: !!testError,
    });
  } catch (connError) {
    console.error("SignUpAction - Connection test failed:", connError);
    return encodedRedirect(
      "error",
      "/sign-up",
      "Unable to connect to authentication service. Please try again later.",
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl,
    },
  });

  console.log("SignUpAction - Response data:", data);
  console.log("SignUpAction - Error details:", {
    error: error,
    code: error?.code,
    message: error?.message,
    status: error?.status,
    isAuthError: error instanceof Error && "status" in error,
  });

  if (error) {
    console.error("SignUpAction - Full error object:", error);

    // Handle specific error types
    if (error.status === 504) {
      // For email signup, a 504 might mean the user was created but email sending timed out
      // Check if we have user data despite the timeout
      if (data.user) {
        console.log(
          "SignUpAction - User created despite timeout, email may still be sent",
        );
        return encodedRedirect(
          "success",
          "/sign-up",
          "Account created! Please check your email for a verification link. If you don't receive it in a few minutes, try signing up again.",
        );
      }
      return encodedRedirect(
        "error",
        "/sign-up",
        "Email service is currently slow. Your account may have been created - please check your email or try again in a few minutes.",
      );
    }

    if (error.code) {
      return encodedRedirect(
        "error",
        "/sign-up",
        error.message || "Authentication error occurred",
      );
    }

    // Fallback for unknown errors
    return encodedRedirect(
      "error",
      "/sign-up",
      "An unexpected error occurred. Please try again.",
    );
  }

  // For email signup with confirmation enabled, data.user will exist but data.session will be null
  // This is expected behavior - the user needs to confirm their email first
  if (data.user && !data.session) {
    console.log("SignUpAction - User created, confirmation email sent");
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link.",
    );
  }

  // If we have both user and session, the user is immediately signed in (confirmation disabled)
  if (data.user && data.session) {
    console.log("SignUpAction - User created and signed in immediately");
    return redirect(redirectTo);
  }

  // If we get here, something unexpected happened
  console.error("SignUpAction - Unexpected response:", data);
  return encodedRedirect(
    "error",
    "/sign-up",
    "Signup failed. Please try again.",
  );
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";
  console.log("SignInAction - RedirectTo:", redirectTo); // Debug log
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message);
  }

  return redirect(redirectTo);
}

export async function signInWithGoogleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";
  console.log("SignInWithGoogleAction - RedirectTo:", redirectTo); // Debug log

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  console.log("Callback URL:", callbackUrl.toString()); // Debug log

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.error("Error in signInWithGoogleAction:", error); // Debug log
    return encodedRedirect("error", "/login", error.message);
  }

  if (data?.url) {
    console.log("Redirecting to OAuth URL:", data.url); // Debug log
    return redirect(data.url);
  }

  console.error("Failed to initiate Google sign-in"); // Debug log
  return encodedRedirect(
    "error",
    "/login",
    "Failed to initiate Google sign-in",
  );
}

export async function signInWithGithubAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";
  console.log("SignInWithGithubAction - RedirectTo:", redirectTo); // Debug log

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message);
  }

  if (data?.url) {
    console.log("Redirecting to OAuth URL:", data.url); // Debug log
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/login",
    "Failed to initiate GitHub sign-in",
  );
}

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  // Only follow same-site relative paths — never an attacker-controlled
  // absolute URL from the form (open-redirect / phishing vector).
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a password reset link.",
  );
}

export async function resetPasswordAction(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect("error", "/reset-password", "Passwords do not match");
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect("error", "/reset-password", "Password update failed");
  }

  encodedRedirect("success", "/reset-password", "Password updated");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/login");
}

export async function signUpWithGoogleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate Google sign-up",
  );
}

export const signUpWithGithubAction = async (formData: FormData) => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate GitHub sign-up",
  );
};

export async function signInWithAppleAction(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";
  console.log("SignInWithAppleAction - RedirectTo:", redirectTo);

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/login", error.message);
  }

  if (data?.url) {
    console.log("Redirecting to Apple OAuth URL:", data.url);
    return redirect(data.url);
  }

  return encodedRedirect("error", "/login", "Failed to initiate Apple sign-in");
}

export const signUpWithAppleAction = async (formData: FormData) => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", encodeURIComponent(redirectTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return encodedRedirect("error", "/sign-up", error.message);
  }

  if (data?.url) {
    return redirect(data.url);
  }

  return encodedRedirect(
    "error",
    "/sign-up",
    "Failed to initiate Apple sign-up",
  );
};
