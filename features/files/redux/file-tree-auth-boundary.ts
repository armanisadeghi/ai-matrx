import { supabase } from "@/utils/supabase/client";

/** Prevent a server-seeded Redux identity from issuing an RPC as anon. */
export async function hasMatchingFileTreeSession(
  requestedUserId: string,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(
    session?.access_token && session.user.id === requestedUserId,
  );
}
