import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  titlePrefix: "Settings",
  title: "Scopes",
  description: "Configure global scope system settings.",
  letter: "SS",
});

export default function ScopeSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
