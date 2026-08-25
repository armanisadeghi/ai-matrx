// /education — the Education module's front door.
//
// TWO audiences, one route (features/auth/.../module-landing, "bounce in"
// posture — the same one `/agents` uses):
//   • Anonymous → the marketing hub. Publicly crawlable, the whole SEO surface.
//   • Signed in → straight into their own Study Hub. A learner who already has
//     kits, decks and work due has no use for the pitch, and leaving them on it
//     was why education had no starting place at all.
//
// The redirect is server-side so the pitch never flashes before the workspace.
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { EducationHub } from "@/features/education/components/landing/EducationHub";
import { EDU_WORKSPACE_HREF } from "@/features/education/constants";

export default async function EducationPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) redirect(EDU_WORKSPACE_HREF);
  return <EducationHub />;
}
