"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { databasePages, isActivePath } from "./config";

export function DatabaseAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentPath, setCurrentPath] = useState<string>("");

  useEffect(() => {
    setCurrentPath(pathname);
  }, [pathname]);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-0">
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar">
          {databasePages.map((page) => {
            const isActive = isActivePath(currentPath, page.path);
            return (
              <Link
                key={page.path}
                href={page.path}
                className={`px-4 py-3 inline-flex items-center text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-slate-800 dark:border-slate-200 text-slate-900 dark:text-slate-100"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {page.title}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
