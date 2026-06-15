import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/war-room", {
  titlePrefix: "Admin",
  title: "War Room",
  description: "War Room feature map, routes, and admin resources.",
  letter: "W",
});

export default function WarRoomAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
