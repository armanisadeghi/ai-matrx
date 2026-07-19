import { Suspense } from "react";
import {
  SitesPortfolio,
  SitesPortfolioLoading,
} from "@/features/marketing/components/sites/SitesPortfolio";

export default function MarketingSitesPage() {
  return (
    <Suspense fallback={<SitesPortfolioLoading />}>
      <SitesPortfolio />
    </Suspense>
  );
}
