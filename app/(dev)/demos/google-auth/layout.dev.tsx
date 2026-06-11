import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { REGISTERED_GOOGLE_SCOPE_URLS } from "@/lib/googleScopes";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/google-auth", {
  titlePrefix: "Google OAuth",
  title: "Scope Approval Demo",
  description: "Test registered GCP OAuth scopes",
  letter: "GO",
});

export default function GoogleAuthDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LazyGoogleAPIProvider scopes={[...REGISTERED_GOOGLE_SCOPE_URLS]}>
      {children}
    </LazyGoogleAPIProvider>
  );
}
