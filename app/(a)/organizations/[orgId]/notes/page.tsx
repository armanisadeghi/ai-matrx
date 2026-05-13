"use client";

import React from "react";
import { LuNotepadText } from "react-icons/lu";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";

/**
 * Organization Shared Notes Page
 * Route: /organizations/[slug]/notes
 */
export default function OrgNotesPage() {
  return (
    <OrgResourceLayout
      resourceName="Notes"
      icon={<LuNotepadText className="h-4 w-4" />}
    >
      <Card className="p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <LuNotepadText className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Shared Notes</h2>
          <p className="text-muted-foreground mb-6">
            Access notes and documents shared with your organization
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted">
            <span className="text-sm font-medium">Coming Soon</span>
          </div>
        </div>
      </Card>
    </OrgResourceLayout>
  );
}
