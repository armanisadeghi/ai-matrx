import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import ShapesLanding from "@/features/auth/components/module-landing/landings/ShapesLanding";

export default async function ShapesPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) redirect("/shapes/all");
  return <ShapesLanding />;
}
