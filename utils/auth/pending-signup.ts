import "server-only";

import { cookies } from "next/headers";

export const PENDING_SIGNUP_EMAIL_COOKIE = "matrx_pending_signup_email";

const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

function normalizedEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) return null;
  return email;
}

/**
 * Short-lived, server-only display state for the confirmation detour. It is
 * never used as identity or authorization; Supabase still verifies the email
 * token before creating a session.
 */
export async function rememberPendingSignupEmail(email: string): Promise<void> {
  const normalized = normalizedEmail(email);
  if (!normalized) return;

  const jar = await cookies();
  jar.set(PENDING_SIGNUP_EMAIL_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function readPendingSignupEmail(): Promise<string | null> {
  const value = (await cookies()).get(PENDING_SIGNUP_EMAIL_COOKIE)?.value;
  return value ? normalizedEmail(value) : null;
}

export async function clearPendingSignupEmail(): Promise<void> {
  (await cookies()).delete(PENDING_SIGNUP_EMAIL_COOKIE);
}
