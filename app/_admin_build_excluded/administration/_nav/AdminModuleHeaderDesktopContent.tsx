"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModulePage } from "@/components/matrx/navigation/types";
import { useModuleHeader } from "@/providers/ModuleHeaderProvider";
import NavigationSelectIcon from "@/components/matrx/navigation/NavigationSelectIcon";
import { HeaderItemWrapper } from "@/components/matrx/navigation/ModuleHeaderDesktopContent";
import AdminBreadcrumbs from "./AdminBreadcrumbs";
import AdminNavTreeMenu from "./AdminNavTreeMenu";

interface AdminModuleHeaderProps {
  pages: ModulePage[];
  moduleHome: string;
  moduleName?: string;
  className?: string;
  routes: string[];
}

export default function AdminModuleHeaderDesktopContent({
  pages,
  moduleHome,
  routes,
  className = "",
}: AdminModuleHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { headerItems } = useModuleHeader();

  const leftItems = headerItems.filter((item) => item.section !== "right");
  const rightItems = headerItems.filter((item) => item.section === "right");

  const getFullPath = (page: ModulePage) => {
    if (!page.relative) {
      return page.path.startsWith("/") ? page.path : `/${page.path}`;
    }
    return moduleHome.startsWith("/")
      ? `${moduleHome}/${page.path}`
      : `/${moduleHome}/${page.path}`;
  };

  const handleNavigation = (path: string) => router.push(path);

  const currentPage = pages.find((page) => getFullPath(page) === pathname);

  return (
    <div className={cn("flex items-center justify-between w-full", className)}>
      <div className="flex items-center gap-1">
        <Link href={moduleHome}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-800 hover:bg-accent dark:text-gray-300"
            aria-label="Admin home"
          >
            <Home className="h-4 w-4" />
          </Button>
        </Link>

        <AdminNavTreeMenu />

        <NavigationSelectIcon
          currentPage={currentPage}
          pages={pages}
          getFullPath={getFullPath}
          handleNavigation={handleNavigation}
        />

        <div className="mx-1 h-5 w-px bg-border" />

        <AdminBreadcrumbs routes={routes} />

        {leftItems.length > 0 && (
          <div className="flex items-center gap-2 pl-1">
            {leftItems.map((item) => (
              <HeaderItemWrapper key={item.id}>
                {item.component}
              </HeaderItemWrapper>
            ))}
          </div>
        )}
      </div>

      {rightItems.length > 0 && (
        <div className="flex items-center gap-2">
          {rightItems.map((item) => (
            <HeaderItemWrapper key={item.id}>
              {item.component}
            </HeaderItemWrapper>
          ))}
        </div>
      )}
    </div>
  );
}
