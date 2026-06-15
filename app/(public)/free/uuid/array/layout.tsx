import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/uuid/array", {
  titlePrefix: "Array",
  title: "UUID",
  description: "Generate arrays of UUIDs in bulk.",
  letter: "Ua",
});

export default function UuidArrayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
