// /war-room/new — create a session and open it (shell's zero-edge entry;
// see features/war-room/shared/WarRoomNew.tsx for the build-graph rationale).
import { WarRoomNew } from "@/features/war-room/shared/WarRoomNew";

export default function NewWarRoomPage() {
  return <WarRoomNew />;
}
