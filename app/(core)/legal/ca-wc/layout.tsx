import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "CA Workers' Comp",
  title: "Legal",
  description: "California workers' compensation tools and calculators.",
  letter: "Lw",
});

export default function CaWcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
