import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "Life Expectancy",
  title: "Utilities",
  description: "Life expectancy calculator for California WC.",
  letter: "Le",
});

export default function LifeExpectancyUtilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
