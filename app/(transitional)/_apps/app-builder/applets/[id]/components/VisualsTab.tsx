'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import AppletVisuals from '@/features/applet/builder/modules/smart-parts/applets/AppletVisuals';

interface VisualsTabProps {
  appletId: string;
  isNew?: boolean;
  isReadOnly?: boolean;
}

export default function VisualsTab({
  appletId,
  isNew = false,
  isReadOnly = false
}: VisualsTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-sm">
        <AppletVisuals appletId={appletId} isNew={isNew} showLayoutOption={false} />
      </Card>
    </div>
  );
} 