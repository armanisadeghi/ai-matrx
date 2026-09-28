import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Open",
  title: "Shared With You",
  description: "Open what somebody shared with everyone in a meeting you were part of.",
  letter: "Sh",
});

export default function RecordShareInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
