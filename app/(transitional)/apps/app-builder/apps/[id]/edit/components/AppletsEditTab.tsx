"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppletIdsForApp } from "@/lib/redux/app-builder/selectors/appSelectors";
import { selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, ExternalLink, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import SmartAppletList from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletList";
import { CustomAppletConfig } from "@/types/customAppTypes";

interface AppletsEditTabProps {
  appId: string;
}

export default function AppletsEditTab({ appId }: AppletsEditTabProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const appletIds = useAppSelector((state) =>
    selectAppletIdsForApp(state, appId),
  );

  const handleAddApplets = () => {
    router.push(`/apps/app-builder/apps/${appId}/applets`);
  };

  const handleViewApplet = (applet: CustomAppletConfig) => {
    router.push(`/apps/app-builder/applets/${applet.id}`);
  };

  const handleEditApplet = (applet: CustomAppletConfig) => {
    router.push(`/apps/app-builder/applets/${applet.id}/edit`);
  };

  const handleRemoveApplet = (appletId: string) => {
    if (
      confirm(
        "Are you sure you want to remove this applet from the app? This will not delete the applet.",
      )
    ) {
      dispatch({
        type: "appBuilder/removeAppletFromApp",
        payload: { appId, appletId },
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Associated Applets
          </h3>
          <Button onClick={handleAddApplets} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Add Applets
          </Button>
        </div>

        {appletIds && appletIds.length > 0 ? (
          <div className="space-y-6">
            <div className="rounded-md border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Slug
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {appletIds.map((id) => (
                    <AppletRow
                      key={id}
                      appletId={id}
                      onView={handleViewApplet}
                      onEdit={handleEditApplet}
                      onRemove={() => handleRemoveApplet(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleAddApplets}>
                <Plus className="h-4 w-4 mr-2" /> Manage All Applets
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No applets associated with this app yet.
            </p>
            <Button onClick={handleAddApplets}>
              <Plus className="h-4 w-4 mr-2" /> Add Applets
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <Button
            variant="outline"
            onClick={() =>
              router.push(`/apps/app-builder/apps/${appId}/preview`)
            }
            className="justify-between"
          >
            Preview App
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Helper component for rendering applet rows
function AppletRow({
  appletId,
  onView,
  onEdit,
  onRemove,
}: {
  appletId: string;
  onView: (applet: CustomAppletConfig) => void;
  onEdit: (applet: CustomAppletConfig) => void;
  onRemove: () => void;
}) {
  const applet = useAppSelector((state) =>
    selectAppletById(state, appletId),
  ) as CustomAppletConfig;

  if (!applet) return null;

  return (
    <tr className="bg-textured">
      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
        {applet.name}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
        {applet.slug}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(applet)}
            className="h-8 px-2"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(applet)}
            className="h-8 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 px-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
