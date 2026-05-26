'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import AppletOverview from '@/features/applet/builder/modules/smart-parts/applets/AppletOverview';

interface OverviewTabProps {
  appletId: string;
  isNew?: boolean;
  isReadOnly?: boolean;
}

export default function OverviewTab({
  appletId,
  isNew = false,
  isReadOnly = false
}: OverviewTabProps) {
  // When in read-only mode, we might still want to show the old view
  // But default to the editable mode using our refactored component
  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-sm">
        <AppletOverview appletId={appletId} isNew={isNew} />
      </Card>
    </div>
  );
} 