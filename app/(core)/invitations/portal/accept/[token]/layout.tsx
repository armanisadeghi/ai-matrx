import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Open",
  title: "Client Portal",
  description: "Open the client portal a business invited you to.",
  letter: "It",
});

export default function PortalInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
