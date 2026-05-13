import { createRouteMetadata } from "@/utils/route-metadata";
import OrgSettingsLayoutClient from "./OrgSettingsLayoutClient";

export const metadata = createRouteMetadata("/settings", {
  titlePrefix: "Organization",
  title: "Settings",
  description: "Organization settings and configuration",
  letter: "OS",
});

export default function OrganizationSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrgSettingsLayoutClient>{children}</OrgSettingsLayoutClient>;
}
