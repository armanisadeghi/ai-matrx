"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Loader2 } from "lucide-react";

if (typeof window !== "undefined") {
  console.log(
    `⚡LazyGoogleAPIProvider module loaded at: ${performance.now().toFixed(2)}ms`,
  );
}

const GoogleAPIProvider = dynamic(() => import("./GoogleApiProvider"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading Google API…
    </div>
  ),
});

interface LazyGoogleAPIProviderProps {
  children: React.ReactNode;
  scopes?: string[];
}

export function LazyGoogleAPIProvider({
  children,
  scopes,
}: LazyGoogleAPIProviderProps) {
  return <GoogleAPIProvider scopes={scopes}>{children}</GoogleAPIProvider>;
}
