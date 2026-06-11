import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Accept",
  title: "Project Invite",
  description: "Accept a project invitation.",
  letter: "Ip",
});

export default function ProjectInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
