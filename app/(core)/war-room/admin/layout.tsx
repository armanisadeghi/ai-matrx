import { createRouteMetadata } from "@/utils/route-metadata";
import { warRoomIcons } from "../warRoomFavicon";

export const metadata = {
  ...createRouteMetadata("/war-room", {
    titlePrefix: "Admin",
    title: "War Room",
    description: "War Room feature map, routes, and admin resources.",
    letter: "WR",
  }),
  icons: warRoomIcons,
};

export default function WarRoomAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
