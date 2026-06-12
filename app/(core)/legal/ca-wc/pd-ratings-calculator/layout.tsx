import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "PD Ratings",
  title: "CA Workers' Comp",
  description:
    "Permanent disability ratings calculator for California WC claims.",
  letter: "Lp",
});

export default function PdRatingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
