import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  titlePrefix: "Templates",
  title: "Scopes",
  description: "Browse and apply scope type templates.",
  letter: "S",
});

export default function ScopeTemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
