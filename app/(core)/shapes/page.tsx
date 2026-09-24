import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import ShapesLanding from "@/features/auth/components/module-landing/landings/ShapesLanding";

export default async function ShapesPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (isAuthenticated) redirect("/shapes/all");
  return <ShapesLanding />;
}
