import React, { useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { EntityKeys } from "@/types/entityTypes";
import { selectFormattedEntityOptions } from "@/lib/redux/schema/globalCacheSelectors";
import type { RootState } from "@/lib/redux/store";
import { cn } from "@/lib/utils"; // Utility for conditional class names
import { Button } from "@/components/ui/button"; // Assuming Button is imported from shadcn components

type Position = "left" | "right" | "top" | "bottom" | "center";
type InitialState = "minimized" | "expanded" | "full";

interface EntityAnalyzerProps {
  position?: Position;
  initialState?: InitialState;
}

const EntityAnalyzerGpt: React.FC<EntityAnalyzerProps> = ({
  position = "bottom",
  initialState = "expanded",
}) => {
  const dispatch = useAppDispatch();
  const entityOptions = useAppSelector(selectFormattedEntityOptions);
  // @ts-ignore
  const entitiesState = useAppSelector((state: RootState) => state.entities);
  const [selectedEntity, setSelectedEntity] = useState<EntityKeys | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(initialState !== "minimized");
  const [isMinimized, setIsMinimized] = useState<boolean>(
    initialState === "minimized",
  );

  const handleEntitySelect = (entityKey: EntityKeys) => {
    setSelectedEntity(entityKey);
  };

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    setIsOpen(true); // Ensure it's open when expanding
  };

  const positionClasses = {
    left: "left-0 top-0 bottom-0 h-full",
    right: "right-0 top-0 bottom-0 h-full",
    top: "top-0 left-0 right-0 w-full",
    bottom: "bottom-0 left-0 right-0 w-full",
    center: "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
  };

  const isFullScreen = initialState === "full";

  const containerClasses = cn(
    "fixed z-50 bg-white shadow-lg border",
    positionClasses[position],
    isFullScreen && !isMinimized ? "w-full h-full" : "",
    isMinimized ? "h-12 w-12" : "",
    !isMinimized &&
      !isFullScreen &&
      (position === "top" || position === "bottom")
      ? "h-1/2"
      : "",
    !isMinimized &&
      !isFullScreen &&
      (position === "left" || position === "right")
      ? "w-1/2"
      : "",
  );

  return (
    <div className={containerClasses}>
      {isMinimized ? (
        <div className="flex items-center justify-center h-full w-full">
          <Button onClick={toggleMinimize} size="sm">
            Open Analyzer
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between p-1 bg-gray-200 sticky top-0">
            <div>
              <Button onClick={toggleOpen} size="sm">
                {isOpen ? "Close" : "Open"} Analyzer
              </Button>
            </div>
            <div>
              <Button onClick={toggleMinimize} size="sm">
                Minimize
              </Button>
            </div>
          </div>
          {isOpen && (
            <div className="p-2 overflow-auto" style={{ maxHeight: "50dvh" }}>
              <div className="flex space-x-1 overflow-x-auto mb-2">
                {entityOptions.map((option) => (
                  <Button
                    key={option.value}
                    onClick={() => handleEntitySelect(option.value)}
                    size="sm"
                    variant={
                      selectedEntity === option.value ? "default" : "outline"
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {selectedEntity && entitiesState[selectedEntity] && (
                <div className="space-y-2">
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].entityMetadata}
                    title="Entity Metadata"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].records}
                    title="Records"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].quickReference}
                    title="Quick Reference"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].selection}
                    title="Selection"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].pagination}
                    title="Pagination"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].loading}
                    title="Loading"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].cache}
                    title="Cache"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].history}
                    title="History"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].filters}
                    title="Filters"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].subscription}
                    title="Subscription"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].flags}
                    title="Flags"
                    initialExpanded={true}
                  />
                  <FullJsonViewer
                    data={entitiesState[selectedEntity].metrics}
                    title="Metrics"
                    initialExpanded={true}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EntityAnalyzerGpt;
