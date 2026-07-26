'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import AppletEditor from '@/features/applet/builder/modules/applet-builder/AppletEditor';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';

interface LegacyEditorTabProps {
  applet: any;
}

export default function LegacyEditorTab({ applet }: LegacyEditorTabProps) {
  const router = useRouter();
  
  // These handlers mirror the original behavior from the main edit page
  const handleSaveSuccess = (appletId: string) => {
    router.push(`/apps/app-builder/applets/${appletId}`);
    toast({
      title: "Success",
      description: "Applet saved successfully",
    });
  };
  
  const handleCancel = () => {
    router.push(`/apps/app-builder/applets/${applet.id}`);
  };
  
  return (
    <div className="space-y-4">
      <Alert className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Legacy Editor</AlertTitle>
        <AlertDescription>
          This is the legacy editor interface. It's provided for backward compatibility, but we recommend using the new tabbed interface for a better editing experience.
        </AlertDescription>
      </Alert>
      
      <AppletEditor 
        appletId={applet.id}
        isCreatingNew={false}
        onSaveSuccess={handleSaveSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
} 