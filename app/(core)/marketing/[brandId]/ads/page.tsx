// app/(core)/marketing/[brandId]/ads/page.tsx
//
// One client's Advertising section. `GoogleAdsWorkspace` needs a live Google
// token, so it keeps the same `LazyGoogleAPIProvider` wrapper (and the same
// reporting scopes) the flat `/marketing/ads` route gave it — the provider is
// part of the mount, not page decoration.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { GoogleAdsWorkspace } from "@/features/marketing/ads/GoogleAdsWorkspace";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { GOOGLE_ADS_REPORTING_SCOPES } from "@/lib/googleScopes";

export default function BrandAdsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Google Ads
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <LazyGoogleAPIProvider scopes={[...GOOGLE_ADS_REPORTING_SCOPES]}>
          <GoogleAdsWorkspace />
        </LazyGoogleAPIProvider>
      </div>
    </>
  );
}
