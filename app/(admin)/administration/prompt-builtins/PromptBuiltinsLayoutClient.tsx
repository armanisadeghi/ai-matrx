"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Zap, FileText, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Categories & Shortcuts",
    href: "/administration/prompt-builtins",
    icon: Folder,
    exact: true,
  },
  {
    label: "Shortcuts Table",
    href: "/administration/prompt-builtins/shortcuts",
    icon: Zap,
  },
  {
    label: "Prompt Builtins",
    href: "/administration/prompt-builtins/builtins",
    icon: FileText,
  },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function PromptBuiltinsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isEditPage = pathname.includes("/prompt-builtins/edit/");

  if (isEditPage) {
    return <>{children}</>;
  }

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="border-b px-4 bg-card flex items-center gap-2">
        <Link
          href="/administration"
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <nav className="flex items-center h-12 gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
