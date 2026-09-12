// app/(core)/print/order/page.tsx
//
// Order printed copies — the live print-on-demand calculator and paid order
// flow, reached from the Print hub at `/print`.
//
// 🚨 This surface opens a REAL Stripe Checkout. The LIVE-MONEY VISIBILITY
// badge and the gate behind it (`features/print/order/ordering-gate.ts`) are
// load-bearing: ordering stays shut until the backend has NAMED its payment
// mode and its two money integrations agree. Read that file's header before
// changing anything in this route.

import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { PrintOrderWorkspace } from "@/features/print/order/PrintOrderWorkspace";

export default function PrintOrderRoute() {
    return (
        <PrintSectionFrame sectionId="order">
            <PrintOrderWorkspace />
        </PrintSectionFrame>
    );
}
