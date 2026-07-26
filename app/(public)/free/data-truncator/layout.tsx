import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/data-truncator", {
  titlePrefix: "JSON Truncator",
  title: "Free Tools",
  description: "Truncate and inspect large JSON payloads for debugging.",
  letter: "Dt",
});

export default function DataTruncatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
