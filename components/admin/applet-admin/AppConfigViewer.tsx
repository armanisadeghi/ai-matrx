import React from "react";
import Image from "next/image";
import Link from "next/link";
import { LayoutTemplate, SquareArrowRight } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { CustomAppConfig } from "@/types/customAppTypes";

// Function to dynamically render Lucide icons
const renderIcon = (
  iconName: string | undefined,
  size = 20,
  className = "",
) => {
  if (!iconName) {
    return <LayoutTemplate size={size} className={className} />;
  }
  return (
    <DynamicIcon
      name={iconName}
      size={size}
      className={className}
      fallbackIcon="LayoutTemplate"
    />
  );
};

type Props = {
  app: CustomAppConfig;
};

const AppConfigViewer = ({ app }: Props) => {
  const primaryColor = app.primaryColor || "gray";
  const accentColor = app.accentColor || "rose";

  return (
    <div className={`bg-textured rounded-lg shadow overflow-hidden`}>
      <div className={`bg-${primaryColor}-100 dark:bg-${primaryColor}-900 p-6`}>
        <div className="relative">
          {/* Icon in the top right */}
          <div className="absolute top-0 right-0">
            {app.mainAppIcon &&
              renderIcon(
                app.mainAppIcon,
                32,
                `text-${accentColor}-600 dark:text-${accentColor}-400`,
              )}
          </div>

          {/* App Title and Creator */}
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
              {app.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Created by {app.creator}
            </p>
          </div>

          {/* Larger image below the title */}
          {app.imageUrl && (
            <div className="mt-4 relative w-full h-48 rounded-lg overflow-hidden">
              <Image
                src={app.imageUrl}
                alt={app.name}
                fill
                className="object-cover"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8 p-6">
        {/* App Info Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-border pb-2">
            App Info
          </h2>

          <div className="mt-4">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">
              Description
            </h3>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              {app.description}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                ID
              </h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">
                {app.id}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Slug
              </h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">
                {app.slug}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Layout Type
              </h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">
                {app.layoutType}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Colors
              </h3>
              <div className="flex items-center space-x-2 mt-1">
                <div
                  className={`w-4 h-4 rounded-full bg-${primaryColor}-500`}
                  title="Primary color"
                ></div>
                <span className="text-sm">Primary: {app.primaryColor}</span>
                <div
                  className={`w-4 h-4 rounded-full bg-${accentColor}-500`}
                  title="Accent color"
                ></div>
                <span className="text-sm">Accent: {app.accentColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Applets Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-border pb-2">
            Available Applets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(app.appletList || []).map((applet) => (
              <div
                key={applet.appletId}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 text-indigo-600 dark:text-indigo-400">
                    {renderIcon(
                      app.mainAppIcon || "LayoutTemplate",
                      20,
                      `text-${accentColor}-600 dark:text-${accentColor}-400`,
                    )}
                  </div>
                  <div>
                    <h3 className="text-md font-medium text-gray-900 dark:text-white">
                      {applet.label}
                    </h3>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/apps/custom/${app.slug}/${applet.slug}`}
                    className={`inline-flex items-center px-3 py-1 text-sm bg-${accentColor}-600 hover:bg-${accentColor}-700 text-white rounded transition-colors`}
                  >
                    <span>View Applet</span>
                    <SquareArrowRight size={14} className="ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Raw JSON Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-border pb-2">
            Raw JSON
          </h2>
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
            <pre className="text-xs text-gray-800 dark:text-gray-200 overflow-auto max-h-96">
              {JSON.stringify(app, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppConfigViewer;
