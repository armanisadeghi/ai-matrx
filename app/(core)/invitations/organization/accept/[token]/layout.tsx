import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Accept",
  title: "Organization Invite",
  description: "Accept an organization invitation.",
  letter: "Io",
});

export default function OrgInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
