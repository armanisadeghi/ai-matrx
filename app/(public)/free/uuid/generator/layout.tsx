import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/uuid/generator", {
  titlePrefix: "Generator",
  title: "UUID",
  description: "Generate version 4 UUIDs with copy and validation.",
  letter: "Ug",
});

export default function UuidGeneratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
