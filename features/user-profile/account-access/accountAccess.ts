import { createClient } from "@/utils/supabase/client";

type AuthClient = Pick<ReturnType<typeof createClient>, "auth">;

export interface AccountAccessState {
  email: string;
  pendingEmail: string | null;
}

function accountFromUser(user: { email?: string | null; new_email?: string | null } | null): AccountAccessState {
  if (!user?.email) throw new Error("Sign in to manage your account.");
  return { email: user.email, pendingEmail: user.new_email ?? null };
}

/** Reads Auth directly; profile Redux state must never stand in for credentials. */
export async function readAccountAccess(client: AuthClient = createClient()): Promise<AccountAccessState> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return accountFromUser(data.user);
}

export function emailChangeCallback(origin: string): string {
  return `${origin}/auth/confirm?redirectTo=${encodeURIComponent("/user-settings/account")}`;
}

export async function requestEmailChange(
  email: string,
  origin: string,
  client: AuthClient = createClient(),
): Promise<AccountAccessState> {
  const current = await readAccountAccess(client);
  const next = email.trim().toLowerCase();
  if (!next || next === current.email.toLowerCase()) {
    throw new Error("Enter a different email address.");
  }
  if (next === current.pendingEmail?.toLowerCase()) {
    throw new Error("That email change is already waiting for confirmation.");
  }
  const { error } = await client.auth.updateUser(
    { email: next },
    { emailRedirectTo: emailChangeCallback(origin) },
  );
  if (error) throw error;
  return readAccountAccess(client);
}

export async function signOutOtherSessions(client: AuthClient = createClient()): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "others" });
  if (error) throw error;
}
