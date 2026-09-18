import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Compute",
  description:
    "Inspect compute services, sandboxes, resilience, and server logs.",
  letter: "CPT",
  canonicalPath: "/administration/compute",
});

export default function ComputeAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
