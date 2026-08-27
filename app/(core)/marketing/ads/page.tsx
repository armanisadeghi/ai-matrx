import PageHeader from "@/features/shell/components/header/PageHeader";
import { GoogleAdsWorkspace } from "@/features/marketing/ads/GoogleAdsWorkspace";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { GOOGLE_ADS_REPORTING_SCOPES } from "@/lib/googleScopes";

export default function Page() {
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
