"use client";

import React, { useEffect, useState } from "react";
import { useWindowSize } from "@uidotdev/usehooks";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import ModuleHeaderMobileContent from "@/components/matrx/navigation/ModuleHeaderMobileContent";
import type { ModulePage } from "@/components/matrx/navigation/types";

interface AdminModuleHeaderProps {
  pages: ModulePage[];
  currentPath: string;
  moduleHome: string;
  moduleName?: string;
  className?: string;
  /** Filesystem route hierarchy under /administration (from scanRoutes). */
  routes: string[];
}

/**
 * Admin-only module header. Mirrors the shared ModuleHeader portal/SSR pattern
 * but renders the enhanced admin desktop content (multi-level breadcrumb
 * dropdowns + tree menu). Mobile reuses the shared mobile content.
 */
function AdminModuleHeaderContent(props: AdminModuleHeaderProps) {
  const { width } = useWindowSize();
  const [DesktopContent, setDesktopContent] = useState<any>(null);

  useEffect(() => {
    import("./AdminModuleHeaderDesktopContent").then((module) => {
      setDesktopContent(() => module.default);
    });
  }, []);

  const isMobile = width != null && width < 768;

  if (isMobile) {
    return <ModuleHeaderMobileContent {...props} />;
  }

  if (!DesktopContent) {
    return null;
  }

  return <DesktopContent {...props} />;
}

export function AdminModuleHeader(props: AdminModuleHeaderProps) {
  return (
    <PageSpecificHeader>
      <AdminModuleHeaderContent {...props} />
    </PageSpecificHeader>
  );
}
