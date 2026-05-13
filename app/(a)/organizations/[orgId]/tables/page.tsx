"use client";

import React from "react";
import { Table } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Tables Page
 * Route: /organizations/[slug]/tables
 */
export default function OrgTablesPage() {
  return (
    <OrgResourceLayout
      resourceName="Tables"
      icon={<Table className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Table className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Tables</h2>
          <p className="text-muted-foreground mb-6">
            Access and manage data tables shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
