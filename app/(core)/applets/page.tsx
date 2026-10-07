import { AppletsListPage } from "@/features/applets/browse/AppletsListPage";
import AppletsLanding from "@/features/auth/components/module-landing/landings/AppletsLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function AppletsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <AppletsLanding />;
  return <AppletsListPage />;
}
