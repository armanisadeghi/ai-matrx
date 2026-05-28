import { createRouteMetadata } from "@/utils/route-metadata";
import { CaPdCalculatorClient } from "@/features/legal/wc/pd-ratings/CaPdCalculatorClient";

export const metadata = createRouteMetadata("/demos/ssr/ca-pd-calculator", {
  titlePrefix: "CA PD Calculator",
  title: "Demo",
  description:
    "California Workers' Compensation Permanent Disability calculator suite — present value, weeks, life expectancy, PPD, and average weekly compensation.",
  letter: "PD",
});

export default function CaPdCalculatorPage() {
  return <CaPdCalculatorClient />;
}
