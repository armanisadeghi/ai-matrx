// /education/overview — THE Education home: the learner's own workspace.
//
// Every other module bounces a signed-in visitor out of the pitch and into the
// app (`/agents` → `/agents/all`, and the same for workflows, files, masterwork,
// war-room, shapes). Education did not, because it had nowhere to bounce them
// TO: this route used to be a static grid of five links with no user data in it.
// It is now the real workspace, and `/education` redirects here when signed in.
//
// Server shell → client island. The home ranks its blocks on a single snapshot
// of what the learner owns, which is a browser-side read of the study spine.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { loginHref } from "@/utils/auth/auth-destination";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { EducationHome } from "@/features/education/home/EducationHome";

export const metadata: Metadata = createRouteMetadata("/education", {
  titlePrefix: "Study Hub",
  title: "Education",
  description:
    "Everything you're studying, what's due, and what to do next — in one place.",
  letter: "Eo",
  canonicalPath: "/education/overview",
});

export default async function EducationOverviewPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/education/overview"));
  return <EducationHome />;
}
