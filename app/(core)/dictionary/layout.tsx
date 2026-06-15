import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/dictionary", {
  titlePrefix: "Admin",
  title: "Dictionary",
  description: "Custom dictionary and pronunciation admin.",
  letter: "Dc",
});

export default function DictionaryAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
