'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import TabsNavigation from '@/components/ui/tabs-navigation';
import { builderModules } from '@/app/(transitional)/apps/builder/hub/build-modules';

interface BuilderPageLayoutProps {
  activeModuleId: string;
  children: React.ReactNode;
  backHref?: string;
  className?: string;
  contentMaxWidth?: string;
}

export default function BuilderPageLayout({
  activeModuleId,
  children,
  backHref = "/apps/builder/hub",
  className = "",
  contentMaxWidth = "max-w-6xl",
}: BuilderPageLayoutProps) {
  // Create tabs from builder modules
  const tabs = builderModules.map(module => ({
    id: module.id,
    label: module.title,
    href: module.href
  }));

  return (
    <div className={`py-4 ${className}`}>
      <div className="px-4 w-full flex justify-start">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Builder Hub</span>
          </Button>
        </Link>
      </div>
      <div className="px-4 mx-auto">
        <TabsNavigation tabs={tabs} activeId={activeModuleId} centered={true} />
      </div>
      <div className={`mx-auto ${contentMaxWidth}`}>
        {children}
      </div>
    </div>
  );
} 