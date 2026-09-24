// /war-room/new — create a session and open it (shell's zero-edge entry;
// see features/war-room/shared/WarRoomNew.tsx for the build-graph rationale).
// Guests bounce server-side to the /war-room marketing landing — the create
// thunk would only fail (RLS) and surface an error panel for them.
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { WarRoomNew } from "@/features/war-room/shared/WarRoomNew";

export default async function NewWarRoomPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect("/war-room");
  }
  return <WarRoomNew />;
}
