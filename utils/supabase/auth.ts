// utils/supabase/auth.ts
// Client-side auth utilities using the browser Supabase client

import { createClient } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";

export type Provider = "github" | "google" | "apple";

export const signInWithOAuth = async (provider: Provider) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
    });

    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in signInWithOAuth:", error);
    return null;
  }
};

export async function getUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}

export const updateUser = async (email: string) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      email,
    });
    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in updateUser:", error);
    return null;
  }
};

export const linkIdentity = async (provider: Provider) => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
    });
    if (error) {
      throw pgErrorToError(error);
    }
    return data;
  } catch (error) {
    console.error("Error in linkIdentity:", error);
    return null;
  }
};
