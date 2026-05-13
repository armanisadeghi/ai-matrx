"use client";

import React from "react";
import { SquareFunction } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Prompt Apps Page
 * Route: /organizations/[slug]/prompt-apps
 */
export default function OrgPromptAppsPage() {
  return (
    <OrgResourceLayout
      resourceName="Prompt Apps"
      icon={<SquareFunction className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <SquareFunction className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Prompt Apps</h2>
          <p className="text-muted-foreground mb-6">
            Use and manage prompt apps shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
