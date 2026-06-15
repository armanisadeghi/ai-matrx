import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/war-room", {
  title: "War Room",
  description:
    "Session-based multitask command center — tiles for tasks, notes, audio, and agents.",
  letter: "W",
});

export default function WarRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
