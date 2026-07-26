'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import AppEditor from '@/features/applet/builder/modules/app-builder/AppEditor';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectHasUnsavedAppChanges } from '@/lib/redux/app-builder/selectors/appSelectors';

interface LegacyEditorTabProps {
  appId: string;
}

export default function LegacyEditorTab({ appId }: LegacyEditorTabProps) {
  const router = useRouter();
  const hasUnsavedChanges = useAppSelector(state => selectHasUnsavedAppChanges(state));
  
  // Handle save success
  const handleSaveSuccess = (savedAppId: string) => {
    // Just stay on the current page as we're already in the editor
  };
  
  // Handle cancel
  const handleCancel = () => {
    if (hasUnsavedChanges) {
      if (confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        router.push(`/apps/app-builder/apps/${appId}`);
      }
    } else {
      router.push(`/apps/app-builder/apps/${appId}`);
    }
  };
  
  return (
    <div className="space-y-6">
      <Alert  className="mb-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Legacy Editor</AlertTitle>
        <AlertDescription>
          This is the original app editor interface. Changes made here will be reflected in the other tabs.
        </AlertDescription>
      </Alert>
      
      <Card className="p-6">
        <AppEditor 
          appId={appId} 
          isCreatingNew={false}
          onSaveSuccess={handleSaveSuccess}
          onCancel={handleCancel}
        />
      </Card>
    </div>
  );
} 