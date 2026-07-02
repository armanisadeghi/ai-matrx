"use client";
import React, { useState } from "react";
import FullScreenOverlay, {
  TabDefinition,
} from "@/components/official/FullScreenOverlay";
import { useAppSelector } from "@/lib/redux/hooks";
import { getAppletBuilderState } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { getAppBuilderState } from "@/lib/redux/app-builder/selectors/appSelectors";
import { getContainerBuilderState } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { getFieldBuilderState } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";
import type { RootState } from "@/lib/redux/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import { useUser } from "@/lib/hooks/useUser";

export type PositionType =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "middle-left"
  | "middle-right"
  | "center";

interface AppBuilderDebugOverlayProps {
  className?: string;
  position?: PositionType;
}

const JsonDisplay: React.FC<{ data: unknown }> = ({ data }) => {
  return (
    <div className="w-full h-full p-4 overflow-auto bg-zinc-100 dark:bg-zinc-900 font-mono text-sm">
      <pre className="whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-200">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

interface TabContentWithSubtabsProps {
  data: unknown;
}

const TabContentWithSubtabs: React.FC<TabContentWithSubtabsProps> = ({
  data,
}) => {
  return (
    <div className="w-full h-full">
      <Tabs defaultValue="simple" className="w-full h-full">
        <div className="border-b border-zinc-200 dark:border-zinc-700 px-2">
          <TabsList className="h-9 bg-transparent">
            <TabsTrigger
              value="simple"
              className="h-8 px-3 text-xs data-[state=active]:bg-zinc-100 data-[state=active]:dark:bg-zinc-800 rounded-t-md"
            >
              Simple View
            </TabsTrigger>
            <TabsTrigger
              value="explorer"
              className="h-8 px-3 text-xs data-[state=active]:bg-zinc-100 data-[state=active]:dark:bg-zinc-800 rounded-t-md"
            >
              Explorer
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="simple" className="mt-0 h-[calc(100%-96px)]">
          <JsonDisplay data={data} />
        </TabsContent>
        <TabsContent
          value="explorer"
          className="h-[calc(100%-65px)] w-full p-4"
        >
          <RawJsonExplorer pageData={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const getPositionClasses = (position: PositionType): string => {
  switch (position) {
    case "top-left":
      return "fixed top-4 left-4";
    case "top-right":
      return "fixed top-4 right-4";
    case "top-center":
      return "fixed top-4 left-1/2 -translate-x-1/2";
    case "bottom-left":
      return "fixed bottom-4 left-4";
    case "bottom-right":
      return "fixed bottom-4 right-4";
    case "bottom-center":
      return "fixed bottom-4 left-1/2 -translate-x-1/2";
    case "middle-left":
      return "fixed top-1/2 left-4 -translate-y-1/2";
    case "middle-right":
      return "fixed top-1/2 right-4 -translate-y-1/2";
    case "center":
      return "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";
    default:
      return "fixed top-1/2 right-4 -translate-y-1/2";
  }
};

const AppBuilderDebugOverlay: React.FC<AppBuilderDebugOverlayProps> = ({
  className = "",
  position = "middle-right",
}) => {
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  const appletState = useAppSelector(getAppletBuilderState);
  const appState = useAppSelector(getAppBuilderState);
  const containerState = useAppSelector(getContainerBuilderState);
  const fieldState = useAppSelector(getFieldBuilderState);
  const { isAdmin } = useUser();

  // Only render for admin users
  if (!isAdmin) return null;

  const handleClose = () => setIsDebugOpen(false);
  const positionClasses = getPositionClasses(position);

  const tabs: TabDefinition[] = [
    {
      id: "app",
      label: "App Builder",
      content: <TabContentWithSubtabs data={appState} />,
    },
    {
      id: "applet",
      label: "Applet Builder",
      content: <TabContentWithSubtabs data={appletState} />,
    },
    {
      id: "container",
      label: "Container Builder",
      content: <TabContentWithSubtabs data={containerState} />,
    },
    {
      id: "field",
      label: "Field Builder",
      content: <TabContentWithSubtabs data={fieldState} />,
    },
  ];

  return (
    <>
      <div className={`z-50 ${positionClasses} ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsDebugOpen(true)}
          className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 bg-transparent hover:bg-transparent"
          aria-label="Debug State"
          title="Debug State"
        >
          <Bug className="h-4 w-4" />
        </Button>
      </div>

      <FullScreenOverlay
        isOpen={isDebugOpen}
        onClose={handleClose}
        title="App Builder Debug"
        description="Debug view of the App Builder state"
        tabs={tabs}
        showCancelButton={true}
        cancelButtonLabel="Close"
      />
    </>
  );
};

export default AppBuilderDebugOverlay;
