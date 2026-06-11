import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "Utilities",
  title: "CA Workers' Comp",
  description: "California workers' compensation utility calculators.",
  letter: "Lu",
});

export default function CaWcUtilitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
