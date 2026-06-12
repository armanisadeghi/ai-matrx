import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/lists", {
  titlePrefix: "v1",
  title: "Picklists",
  description: "Picklist UI variant 1.",
  letter: "L1",
});

export default function ListsV1Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
