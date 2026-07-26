"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveAppletId } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { startNewApplet } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/components/ui/use-toast";
import AppletEditor from "@/features/applet/builder/modules/applet-builder/AppletEditor";

export default function AppletCreatePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  // Get the active applet ID from Redux
  const activeAppletId = useAppSelector(selectActiveAppletId);

  // Initialize applet creation if there's no active applet
  useEffect(() => {
    if (!activeAppletId) {
      const newId = uuidv4();
      dispatch(startNewApplet({ id: newId }));
    }
  }, [activeAppletId, dispatch]);

  // Handle save success - navigate to the applet view
  const handleSaveSuccess = (appletId: string) => {
    router.push(`/apps/app-builder/applets/${appletId}`);
  };

  // Handle cancel - go back to applets list
  const handleCancel = () => {
    router.push("/apps/app-builder/applets");
  };

  // If no active applet ID yet, show loading
  if (!activeAppletId) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppletEditor
        appletId={activeAppletId}
        isCreatingNew={true}
        onSaveSuccess={handleSaveSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
