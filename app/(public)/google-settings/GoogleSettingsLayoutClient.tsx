"use client";

import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { REGISTERED_GOOGLE_SCOPE_URLS } from "@/lib/googleScopes";

export default function GoogleSettingsLayoutClient({
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
