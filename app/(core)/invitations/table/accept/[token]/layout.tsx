import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Open",
  title: "Shared Table",
  description: "Open a table somebody outside your organization shared with you.",
  letter: "It",
});

export default function TableShareInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
