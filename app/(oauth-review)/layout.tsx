import { Providers } from "@/app/Providers";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createClient } from "@/utils/supabase/server";
import { getAdminStatus } from "@/utils/supabase/userSessionData";
import { mapUserData } from "@/utils/userDataMapper";

export default async function OAuthReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerAuth();
  const client = await createClient();
  const [sessionResult, admin] = await Promise.all([
    client.auth.getSession(),
    user ? getAdminStatus(client, user.id) : Promise.resolve({ isAdmin: false, level: null }),
  ]);
  const initialState = {
    user: mapUserData(user, sessionResult.data.session?.access_token, admin.isAdmin, admin.level),
  };

  return (
    // The review routes use shared record doors and overlays just like the app.
    // Bind the canonical hosts once, while keeping the reviewer page shell-free.
    <Providers initialReduxState={initialState}>{children}</Providers>
  );
}
