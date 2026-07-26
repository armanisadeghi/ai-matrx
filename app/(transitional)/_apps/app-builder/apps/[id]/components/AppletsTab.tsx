"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletIdsForApp } from "@/lib/redux/app-builder/selectors/appSelectors";
import SmartAppletList from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletList";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { CustomAppletConfig } from "@/types/customAppTypes";

interface AppletsTabProps {
  appId: string;
}

export default function AppletsTab({ appId }: AppletsTabProps) {
  const router = useRouter();
  const appletIds = useAppSelector((state) =>
    selectAppletIdsForApp(state, appId),
  );

  const handleAddApplet = () => {
    router.push(`/apps/app-builder/apps/${appId}/applets`);
  };

  const handleViewApplet = (applet: CustomAppletConfig) => {
    router.push(`/apps/app-builder/applets/${applet.id}`);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Associated Applets
          </h3>
          <Button onClick={handleAddApplet} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Manage Applets
          </Button>
        </div>

        {appletIds && appletIds.length > 0 ? (
          <SmartAppletList
            appId={appId}
            onSelectApplet={handleViewApplet}
            showCreateButton={false}
            className="mt-4"
          />
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No applets associated with this app yet.
            </p>
            <Button variant="outline" onClick={handleAddApplet}>
              <Plus className="h-4 w-4 mr-2" /> Add Applets
            </Button>
          </div>
        )}
      </Card>

      {/* Additional Card for Quick Actions */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            variant="outline"
            onClick={() => router.push(`/apps/app-builder/apps/${appId}/build`)}
            className="justify-between"
          >
            Build App
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              router.push(`/apps/app-builder/apps/${appId}/preview`)
            }
            className="justify-between"
          >
            Preview App
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              router.push(`/apps/app-builder/applets/create?appId=${appId}`)
            }
            className="justify-between"
          >
            Create New Applet
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
