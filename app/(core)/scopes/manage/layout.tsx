import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  titlePrefix: "Manage",
  title: "Scopes",
  description: "Redirect to the scopes hub.",
  letter: "S",
});

export default function ScopesManageRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
