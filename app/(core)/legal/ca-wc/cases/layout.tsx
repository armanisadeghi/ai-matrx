import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "Cases",
  title: "CA Workers' Comp",
  description: "Browse California workers' compensation cases.",
  letter: "Lc",
});

export default function CaWcCasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
