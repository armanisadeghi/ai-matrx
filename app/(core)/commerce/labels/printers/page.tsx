// app/(core)/commerce/labels/printers/page.tsx
//
// Certified printers — which printers are proven to print label stock
// correctly, over commerce.certified_printer. See
// features/commerce-intake/FEATURE.md § Printer certification.

import { CertifiedPrintersPage } from "@/features/commerce-intake/labels/printers/components/CertifiedPrintersPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/labels/printers", {
  title: "Certified Printers",
  description:
    "Certify any printer against your label stock: print one calibration page, answer four checks, and record the result for your whole team.",
  canonicalPath: "/commerce/labels/printers",
});

export default function CertifiedPrintersRoute() {
  return <CertifiedPrintersPage />;
}
