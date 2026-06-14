// app/(core)/war-room/all/page.tsx
//
// Authenticated War Room browser. The marketing landing lives one URL up at
// `/war-room` — guests are bounced there server-side.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { WarRoomAllView } from "@/features/war-room/components/all/WarRoomAllView";

export default async function WarRoomAllPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/war-room");
  }
  return <WarRoomAllView />;
}
