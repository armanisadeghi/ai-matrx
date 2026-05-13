"use client";

import React from "react";
import { ListTodo } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Tasks Page
 * Route: /organizations/[slug]/tasks
 */
export default function OrgTasksPage() {
  return (
    <OrgResourceLayout
      resourceName="Tasks"
      icon={<ListTodo className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListTodo className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Tasks</h2>
          <p className="text-muted-foreground mb-6">
            View and manage tasks shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
