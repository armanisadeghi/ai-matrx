"use client";

import React from "react";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { REGISTERED_GOOGLE_SCOPE_URLS } from "@/lib/googleScopes";

export default function GoogleApisLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LazyGoogleAPIProvider scopes={[...REGISTERED_GOOGLE_SCOPE_URLS]}>
      <div className="flex flex-col min-h-dvh h-full bg-gray-50 dark:bg-gray-950">
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </LazyGoogleAPIProvider>
  );
}
