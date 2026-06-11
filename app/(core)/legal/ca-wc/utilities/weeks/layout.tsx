import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "Weeks",
  title: "Utilities",
  description: "California WC weeks calculator utility.",
  letter: "Wk",
});

export default function WeeksUtilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
