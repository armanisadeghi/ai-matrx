import { createRouteMetadata } from "@/utils/route-metadata";
import { warRoomIcons } from "./warRoomFavicon";

export const metadata = {
  ...createRouteMetadata("/war-room", {
    title: "War Room",
    description:
      "Session-based multitask command center — tiles for tasks, notes, audio, and agents.",
    letter: "WR",
  }),
  icons: warRoomIcons,
};

export default function WarRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
