// The brand-free START door: /marketing/topical-maps/start[?research=<id>&source=<kind>].
//
// A research topic belongs to an organization, never to a brand, so the
// research output card ("Topical map") cannot know which brand's map to start
// — it lands here, where the person picks the brand and the same start screen
// the Content home renders takes over. Signed-out visitors go to login and
// come back here with their destination intact (auth doctrine).

import { redirect } from "next/navigation";

import { TopicalMapStartDoor } from "@/features/marketing/seo/topical-map/door/TopicalMapStartDoor";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function TopicalMapStartPage({
  searchParams,
}: {
  searchParams: Promise<{ research?: string; source?: string }>;
}) {
  const params = await searchParams;
  const { user, authUnavailable } = await getServerAuth();
  if (!user && authUnavailable) {
    console.warn(
      "[marketing/topical-maps/start] identity could not be verified — showing the retry notice, NOT redirecting to /login.",
    );
    return (
      <div className="p-4 text-sm text-muted-foreground">
        We could not verify who you are on this request, so this page is not
        loading. You have not been signed out — reload in a moment.
      </div>
    );
  }
  if (!user) {
    const query = new URLSearchParams();
    if (params.research) query.set("research", params.research);
    if (params.source) query.set("source", params.source);
    const suffix = query.toString();
    redirect(
      `/login?redirectTo=${encodeURIComponent(`/marketing/topical-maps/start${suffix ? `?${suffix}` : ""}`)}`,
    );
  }
  return <TopicalMapStartDoor />;
}
