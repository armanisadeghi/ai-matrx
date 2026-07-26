'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import AppletOverview from '@/features/applet/builder/modules/smart-parts/applets/AppletOverview';

interface OverviewEditTabProps {
  id: string;
  onUpdate?: (field: string, value: string) => void;
}

export default function OverviewEditTab({
  id,
}: OverviewEditTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-sm">
        <AppletOverview appletId={id} />
      </Card>
    </div>
  );
} 