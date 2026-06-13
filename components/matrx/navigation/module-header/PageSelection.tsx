"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { PanelTopOpen } from "lucide-react";
import IconSelect from "@/components/official/IconSelect";
import { ModulePage } from "../types";

interface PageSelectionProps {
  pages: ModulePage[];
  moduleHome: string;
}

export default function PageSelection({
  pages,
  moduleHome,
}: PageSelectionProps) {
  const router = useRouter();
  const pathname = usePathname();

  const getFullPath = (page: ModulePage) => {
    if (!page.relative) {
      return page.path.startsWith("/") ? page.path : `/${page.path}`;
    }
    return moduleHome.startsWith("/")
      ? `${moduleHome}/${page.path}`
      : `/${moduleHome}/${page.path}`;
  };

  const currentPage = pages.find((page) => {
    const fullPath = getFullPath(page);
    return pathname === fullPath;
  });

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const navigationItems = pages.map((page, index) => ({
    id: `${getFullPath(page)}-${index}`,
    label: page.title,
    value: getFullPath(page),
  }));

  return (
    <IconSelect
      items={navigationItems}
      icon={<PanelTopOpen className="h-5 w-5 opacity-70" />}
      value={currentPage ? getFullPath(currentPage) : undefined}
      onValueChange={handleNavigation}
      searchable
      searchPlaceholder="Search routes..."
    />
  );
}
