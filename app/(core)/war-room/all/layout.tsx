import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/war-room", {
  titlePrefix: "Sessions",
  title: "War Room",
  description: "Browse and open your War Room sessions.",
  letter: "WRL",
});

export default function WarRoomAllLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
