import { createClient } from "@/utils/supabase/server";
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
    const { data } = await supabase
      .from("wr_sessions")
      .select("title, description")
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
    letter: "W",
  });
}

export default function WarRoomSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
