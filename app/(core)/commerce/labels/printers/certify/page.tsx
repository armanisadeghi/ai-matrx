// app/(core)/commerce/labels/printers/certify/page.tsx
//
// The guided printer certification. `?id=<certified_printer.id>` re-checks an
// existing record instead of creating a new one.

import { Suspense } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

import { CertifyRouteClient } from "./CertifyRouteClient";

export const metadata = createRouteMetadata("/commerce/labels/printers/certify", {
  title: "Certify a printer",
  description:
    "Print one calibration page, answer four checks about how it came out, and record whether this printer prints your label stock correctly.",
  canonicalPath: "/commerce/labels/printers/certify",
});

export default function CertifyPrinterRoute() {
  return (
    <Suspense fallback={null}>
      <CertifyRouteClient />
    </Suspense>
  );
}
