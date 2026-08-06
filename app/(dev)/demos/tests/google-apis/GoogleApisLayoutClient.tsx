"use client";

import React from "react";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { GOOGLE_SEARCH_CONSOLE_SCOPES } from "@/lib/googleScopes";

export default function GoogleApisLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_SEARCH_CONSOLE_SCOPES]}>
      <div className="flex flex-col min-h-dvh h-full bg-gray-50 dark:bg-gray-950">
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </LazyGoogleAPIProvider>
  );
}
