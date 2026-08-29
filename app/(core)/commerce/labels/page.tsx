// app/(core)/commerce/labels/page.tsx
//
// QR label batches — print runs of pooled intake codes over
// commerce.label_batch / commerce.label_code. See
// features/commerce-intake/FEATURE.md § The label pool.

import { LabelBatchesPage } from "@/features/commerce-intake/labels/components/LabelBatchesPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/labels", {
  title: "QR Labels",
  description:
    "Mint pooled QR codes, print label sheets, and claim labels onto intake items by scanning them.",
  canonicalPath: "/commerce/labels",
});

export default function CommerceLabelsPage() {
  return <LabelBatchesPage />;
}
