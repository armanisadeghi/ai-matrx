import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/detail", {
  title: "Record details",
  description: "Open records in a page, docked panel, or window.",
  letter: "DT",
});

export default function DetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
