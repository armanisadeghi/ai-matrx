"use client";

// ModuleHeaderMobile.tsx
import React, { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Home, ShieldPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { cn } from "@/lib/utils";
import { ModulePage } from "./types";
import { useModuleHeader } from "@/providers/ModuleHeaderProvider";
import PageSelection from "./module-header/PageSelection";
import AdminShortcuts from "./module-header/AdminShortcuts";

interface ModuleHeaderProps {
  pages: ModulePage[];
  moduleHome: string;
  moduleName?: string;
  className?: string;
}

export function ModuleHeaderMobile({
  pages,
  moduleHome,
  moduleName,
  className = "",
}: ModuleHeaderProps) {
  const { headerItems } = useModuleHeader();
  const leftItems = headerItems.filter((item) => item.section !== "right");
  const rightItems = headerItems.filter((item) => item.section === "right");

  const headerVariants = {
    initial: { opacity: 0, y: -20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.header
      variants={headerVariants}
      initial="initial"
      animate="animate"
      className={cn(
        "h-10 flex items-center justify-between bg-gray-200 dark:bg-gray-900 backdrop-blur-sm border-b-2 border-gray-200 dark:border-gray-700 px-1",
        "overflow-hidden",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href=".."
          aria-label="Back to parent page"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
        >
          <Home className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex-1 mx-2 truncate bg-gray-200 dark:bg-gray-900">
        <PageSelection pages={pages} moduleHome={moduleHome} />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label={`Open ${moduleName || "module"} menu`}
        onClick={() => setMenuOpen(true)}
      >
        <ShieldPlus className="h-4 w-4" />
      </Button>
      <MatrxDynamicPanelHost
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={moduleName || "Menu"}
        position="right"
        defaultSize={36}
        contentClassName="overflow-y-auto"
      >
        <div className="space-y-4">
          {leftItems.map((item) => (
            <div key={item.id} className="py-2">
              {item.component}
            </div>
          ))}
          {rightItems.map((item) => (
            <div key={item.id} className="py-2">
              {item.component}
            </div>
          ))}
          <div className="py-2">
            <AdminShortcuts />
          </div>
        </div>
      </MatrxDynamicPanelHost>
    </motion.header>
  );
}

export default ModuleHeaderMobile;
