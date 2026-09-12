import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/organizations/emergency-access", {
  title: "Emergency access",
  titlePrefix: "Organizations",
  description:
    "Requests to read a person's private data, waiting on an organization owner's approval.",
  letter: "EA",
});

export default function EmergencyAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
