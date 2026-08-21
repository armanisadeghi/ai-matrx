import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { EducationOverview } from "@/features/education/components/overview/EducationOverview";

export const metadata: Metadata = createRouteMetadata("/education", {
  titlePrefix: "Overview",
  title: "Education",
  description: "Your compact navigation hub for AI Matrx study tools.",
  letter: "Eo",
  canonicalPath: "/education/overview",
});

export default async function EducationOverviewPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/education/overview"));
  return <EducationOverview />;
}
