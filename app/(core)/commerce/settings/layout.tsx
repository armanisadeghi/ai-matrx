import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/settings", {
  title: "Commerce Configuration",
  description:
    "Organization and personal overrides of the platform's commerce configuration knobs.",
  letter: "Cf",
});

export default function CommerceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
