// app/(core)/print/order/layout.tsx
//
// Ordering printed copies calls `/lulu/*` on the aidream server, which is
// mounted behind `require_authenticated` — a signed-out visitor's request was
// always going to fail server-side. Before the org-context kernel went
// fail-closed (aidream 8e5ee0b93), that surfaced as a network 401 the client
// component didn't handle either; now it surfaces as the client-side
// `OrganizationContextError` before any request even fires ("Select an
// organization before sending this request."). Either way, an anonymous
// visitor must never see a raw error — branch on the server per the
// module-landing-pages doctrine. The rest of `/print/*` needs no gate: those
// printers run in the browser.

import { BookText } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Order printed copies",
    title: "Print",
    description:
        "Price a real book — trim, paper, binding, cover finish, quantity and destination — against a live print-on-demand catalogue, then order printed copies.",
    letter: "Pt",
    canonicalPath: "/print/order",
});

export default async function PrintOrderLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = await getServerAuth();
    if (!isAuthenticated) {
        return (
            <ModuleSignInGate
                title="Order printed copies"
                route="/print/order"
                description="Sign in to price a print-on-demand book live — sized, bound, and shipped, calculated against the real print catalogue."
                icon={BookText}
            />
        );
    }
    return children;
}
