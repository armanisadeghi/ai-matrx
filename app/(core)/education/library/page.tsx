import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { EducationLibraryPage } from "@/features/education/library/components/EducationLibraryPage";

export const metadata: Metadata = createRouteMetadata("/education", {
  titlePrefix: "Library",
  title: "Education",
  description:
    "Find your flashcards, assessments, study media, and notes in one scoped Education Library.",
  letter: "Lb",
  canonicalPath: "/education/library",
});

export default async function EducationLibraryRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/education/library"));
  return <EducationLibraryPage />;
}
