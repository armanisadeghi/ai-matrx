"use client";

import React from "react";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";

export default function GoogleApisLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LazyGoogleAPIProvider>
      <div className="flex flex-col min-h-screen h-full bg-gray-50 dark:bg-gray-950">
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </LazyGoogleAPIProvider>
  );
}
