import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Utilities",
  description:
    "Open administrative utilities for inspection, testing, and system maintenance.",
  letter: "UT",
  canonicalPath: "/administration/utilities",
});

export default function UtilitiesAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
