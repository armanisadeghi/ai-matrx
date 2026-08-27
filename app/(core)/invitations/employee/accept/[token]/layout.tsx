import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/invitations", {
  titlePrefix: "Accept",
  title: "Employee Invite",
  description: "Accept an invitation to sign in to your employer's HR records.",
  letter: "Ie",
});

export default function EmployeeInvitationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
