"use client";

import React from "react";
import { ClipboardType } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Content Templates Page
 * Route: /organizations/[slug]/templates
 */
export default function OrgTemplatesPage() {
  return (
    <OrgResourceLayout
      resourceName="Content Templates"
      icon={<ClipboardType className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardType className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Content Templates</h2>
          <p className="text-muted-foreground mb-6">
            Browse and use content templates shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
