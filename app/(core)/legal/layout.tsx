import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  title: "Legal",
  description:
    "Legal tools, calculators, and California workers' compensation utilities.",
  letter: "Lg",
});

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
