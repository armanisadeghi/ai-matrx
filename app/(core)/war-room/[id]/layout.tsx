import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let title = "War Room";
  let description = "Multitask command center session.";

  try {
    const supabase = await createClient();
    // War-room session moved to the `workspace` schema (war_rooms).
    const { data } = await workspaceDb(supabase)
      .from("war_rooms")
      .select("title, description")
      .is("deleted_at", null)
      .eq("id", id)
      .maybeSingle();

    if (data?.title) title = data.title;
    if (data?.description) {
      description = data.description.slice(0, 120);
    }
  } catch {
    // Fall back to generic session metadata.
  }

  return createDynamicRouteMetadata("/war-room", {
    title,
    description,
    letter: "WR",
  });
}

export default async function WarRoomSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guests bounce server-side to the /war-room marketing landing — the room
  // shell can only hydrate for an authenticated user and would otherwise show
  // a broken workspace.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/war-room");
  }
  return children;
}
