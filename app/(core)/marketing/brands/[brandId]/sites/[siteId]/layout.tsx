import { MarketingSiteLayoutClient } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

export default function MarketingSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingSiteLayoutClient>{children}</MarketingSiteLayoutClient>;
}
