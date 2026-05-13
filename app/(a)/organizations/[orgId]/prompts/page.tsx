"use client";

import React from "react";
import { FaIndent } from "react-icons/fa6";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Prompts Page
 * Route: /organizations/[slug]/prompts
 */
export default function OrgPromptsPage() {
  return (
    <OrgResourceLayout
      resourceName="Prompts"
      icon={<FaIndent className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaIndent className="h-8 w-8 text-teal-600 dark:text-teal-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Prompts</h2>
          <p className="text-muted-foreground mb-6">
            View and manage prompts shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
