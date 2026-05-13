"use client";

import React from "react";
import { Workflow } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Workflows Page
 * Route: /organizations/[slug]/workflows
 */
export default function OrgWorkflowsPage() {
  return (
    <OrgResourceLayout
      resourceName="Workflows"
      icon={<Workflow className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Workflow className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Workflows</h2>
          <p className="text-muted-foreground mb-6">
            View and execute workflows shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
