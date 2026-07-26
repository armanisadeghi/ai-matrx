import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import AppBuilderLayoutClient from "./layout-client";

// Force dynamic rendering for app-builder pages to avoid build timeouts
export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/apps/app-builder", {
  title: "App Builder",
  description: "Compose fields, applets, apps, and containers for Matrx.",
});

interface AppBuilderLayoutProps {
  children: ReactNode;
}

export default function AppBuilderLayout({ children }: AppBuilderLayoutProps) {
  return <AppBuilderLayoutClient>{children}</AppBuilderLayoutClient>;
}
