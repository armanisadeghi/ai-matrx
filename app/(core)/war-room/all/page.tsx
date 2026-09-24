// app/(core)/war-room/all/page.tsx
//
// Authenticated War Room browser. The marketing landing lives one URL up at
// `/war-room` — guests are bounced there server-side.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { WarRoomAllView } from "@/features/war-room/components/all/WarRoomAllView";

export default async function WarRoomAllPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect("/war-room");
  }
  return <WarRoomAllView />;
}
