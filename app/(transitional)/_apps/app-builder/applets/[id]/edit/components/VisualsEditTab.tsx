'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import AppletVisuals from '@/features/applet/builder/modules/smart-parts/applets/AppletVisuals';

interface VisualsEditTabProps {
  id: string;
  onUpdate?: (field: string, value: string) => void;
}

export default function VisualsEditTab({
  id,
}: VisualsEditTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-sm">
        <AppletVisuals appletId={id} showLayoutOption={false} />
      </Card>
    </div>
  );
} 