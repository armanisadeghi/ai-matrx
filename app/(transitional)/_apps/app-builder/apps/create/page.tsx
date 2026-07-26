"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveAppId } from "@/lib/redux/app-builder/selectors/appSelectors";
import { startNewApp } from "@/lib/redux/app-builder/slices/appBuilderSlice";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/components/ui/use-toast";
import AppEditor from "@/features/applet/builder/modules/app-builder/AppEditor";

export default function AppCreatePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  // Get the active app ID from Redux
  const activeAppId = useAppSelector(selectActiveAppId);

  // Initialize app creation if there's no active app
  useEffect(() => {
    if (!activeAppId) {
      // Generate a new UUID for the app
      const newId = uuidv4();

      // Start app creation in Redux
      dispatch(startNewApp({ id: newId }));
    }
  }, [activeAppId, dispatch]);

  // Handle save success - navigate to the app view
  const handleSaveSuccess = (appId: string) => {
    router.push(`/apps/app-builder/apps/${appId}`);
  };

  // Handle cancel - go back to apps list
  const handleCancel = () => {
    router.push("/apps/app-builder/apps");
  };

  // If no active app ID yet, show loading
  if (!activeAppId) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppEditor
        appId={activeAppId}
        isCreatingNew={true}
        onSaveSuccess={handleSaveSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
