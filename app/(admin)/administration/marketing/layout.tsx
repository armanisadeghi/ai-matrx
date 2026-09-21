import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Marketing Engines",
  description:
    "Operate and inspect the platform's marketing coverage engines.",
  letter: "MK",
  canonicalPath: "/administration/marketing",
});

export default function MarketingAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
