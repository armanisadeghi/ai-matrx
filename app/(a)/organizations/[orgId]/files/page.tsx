"use client";

import React from "react";
import { FolderOpen } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Files Page
 * Route: /organizations/[slug]/files
 */
export default function OrgFilesPage() {
  return (
    <OrgResourceLayout
      resourceName="Files"
      icon={<FolderOpen className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Files</h2>
          <p className="text-muted-foreground mb-6">
            Access files and documents shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
