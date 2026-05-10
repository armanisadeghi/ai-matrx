import type { Metadata } from "next";
import { CaPdCalculatorClient } from "@/features/legal/wc/pd-ratings/CaPdCalculatorClient";

export const metadata: Metadata = {
  title: "PD Ratings Calculator",
  description:
    "California Workers' Compensation Permanent Disability rating — AMA Guides aligned, with age + occupation adjustments, combined per-side rating, and live compensation calculation.",
};

export default function PdRatingsCalculatorPage() {
  return <CaPdCalculatorClient />;
}
