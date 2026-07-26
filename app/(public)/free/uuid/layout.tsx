import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/uuid", {
  titlePrefix: "UUID",
  title: "Free Tools",
  description: "UUID utilities — generate and validate identifiers.",
  letter: "Ui",
});

export default function UuidToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
