"use client";

import { useEffect, useState } from "react";
import type { ModulePage } from "@/components/matrx/navigation/types";
import { PageSpecificHeader } from "./PageSpecificHeaderPortal";

export { PageSpecificHeader } from "./PageSpecificHeaderPortal";

interface ModuleHeaderProps {
  pages: ModulePage[];
  currentPath: string;
  moduleHome: string;
  moduleName?: string;
  className?: string;
}

export function ModuleHeader(props: ModuleHeaderProps) {
  // Dynamically import the component to avoid SSR issues
  const [ResponsiveModuleHeaderContent, setResponsiveModuleHeaderContent] =
    useState<any>(null);

  useEffect(() => {
    import("@/components/matrx/navigation/ResponsiveModuleHeaderContent").then(
      (module) => {
        setResponsiveModuleHeaderContent(() => module.default);
      },
    );
  }, []);

  if (!ResponsiveModuleHeaderContent) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <ResponsiveModuleHeaderContent {...props} />
    </PageSpecificHeader>
  );
}
