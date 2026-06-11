import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/lists", {
  titlePrefix: "v3",
  title: "Picklists",
  description: "Picklist UI variant 3.",
  letter: "L3",
});

export default function ListsV3Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
