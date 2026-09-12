// app/(core)/print/page.tsx
//
// /print — one URL, two audiences (module-landing-pages doctrine).
//
// A guest gets the public marketing landing for Print and is NEVER bounced to
// a login wall or an error. A signed-in visitor gets the hub itself at the
// same URL. The branch is made server-side (`getServerAuth()` is request-scope
// cached — the parent layout already paid for it) so neither tree leaks into
// the other's bundle.

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import PrintLanding from "@/features/auth/components/module-landing/landings/PrintLanding";
import { PrintHub } from "@/features/print/hub/PrintHub";

export default async function PrintHubRoute() {
    const { isAuthenticated } = await getServerAuth();

    if (!isAuthenticated) {
        return (
            <MarketingPageShell>
                <PrintLanding />
            </MarketingPageShell>
        );
    }

    return <PrintHub />;
}
