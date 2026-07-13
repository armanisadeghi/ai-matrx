import { createRouteMetadata } from "@/utils/route-metadata";
import { warRoomIcons } from "../warRoomFavicon";

export const metadata = {
  ...createRouteMetadata("/war-room", {
    titlePrefix: "Sessions",
    title: "War Room",
    description: "Browse and open your War Room sessions.",
    letter: "WR",
  }),
  icons: warRoomIcons,
};

export default function WarRoomAllLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
