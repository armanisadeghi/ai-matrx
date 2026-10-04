import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import StoreProvider from "@/providers/StoreProvider";
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
    <StoreProvider initialState={initialState}>
      <ReactQueryProvider>{children}</ReactQueryProvider>
    </StoreProvider>
  );
}
