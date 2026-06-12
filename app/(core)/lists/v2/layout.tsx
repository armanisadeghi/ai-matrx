import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/lists", {
  titlePrefix: "v2",
  title: "Picklists",
  description: "Picklist UI variant 2.",
  letter: "L2",
});

export default function ListsV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
