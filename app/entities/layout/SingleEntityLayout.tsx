"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import EntitySelection from "@/components/matrx/Entity/prewired-components/entity-management/EntitySelection";
import { UnifiedLayoutProps } from "@/components/matrx/Entity/prewired-components/layouts/types";
import { useWindowSize } from "@uidotdev/usehooks";
import DynamicQuickReference from "@/app/entities/quick-reference/dynamic-quick-ref/DynamicQuickReference";
import { EntityKeys } from "@/types/entityTypes";
import EntityRightColumnLayout from "./EntityRightColumnLayout";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUnifiedLayoutProps } from "./configs";

const LeftColumn: React.FC<{
  selectedEntity: EntityKeys | null;
  onEntityChange: (value: EntityKeys) => void;
  updateKey: number;
  availableHeight: number;
  unifiedLayoutProps: UnifiedLayoutProps;
}> = ({
  selectedEntity,
  onEntityChange,
  updateKey,
  availableHeight,
  unifiedLayoutProps,
}) => (
  <div
    className="w-[340px] min-w-[340px] max-w-[340px] border-r border-border"
    style={{ height: availableHeight }}
  >
    <ScrollArea className="h-full">
      <div className="w-full overflow-hidden">
        <div className="flex-1 w-full">
          <DynamicQuickReference
            key={`quickref-${selectedEntity}-${updateKey}`}
            entityKey={selectedEntity}
            smartCrudProps={
              unifiedLayoutProps.dynamicLayoutOptions.componentOptions
                .quickReferenceCrudWrapperProps
            }
          />
        </div>
      </div>
    </ScrollArea>
  </div>
);

export const SingleEntityLayout: React.FC<UnifiedLayoutProps> = (props) => {
  const { layoutState } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);
  const [updateKey, setUpdateKey] = useState(0);
  const windowSize = useWindowSize();
  const selectedEntity = layoutState?.selectedEntity || null;

  useEffect(() => {
    const calculateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const topPosition = rect.top;
        const newHeight = viewportHeight - topPosition - 16;
        setAvailableHeight(newHeight);
      }
    };
    calculateHeight();
    window.addEventListener("resize", calculateHeight);
    return () => window.removeEventListener("resize", calculateHeight);
  }, [windowSize.height]);

  const handleEntityChange = (value: EntityKeys) => {
    layoutState.selectedEntity = value;
    setUpdateKey((prev) => prev + 1);
    if (props.handlers?.handleEntityChange) {
      props.handlers.handleEntityChange(value);
    }
  };

  const modifiedProps: UnifiedLayoutProps = {
    ...props,
    handlers: {
      ...props.handlers,
      handleEntityChange,
    },
    layoutState: {
      ...layoutState,
    },
  };

  return (
    <div ref={containerRef} className={cn("w-full")}>
      <div className="flex overflow-hidden" style={{ height: availableHeight }}>
        <LeftColumn
          selectedEntity={selectedEntity}
          onEntityChange={handleEntityChange}
          updateKey={updateKey}
          availableHeight={availableHeight}
          unifiedLayoutProps={modifiedProps}
        />
        <EntityRightColumnLayout
          selectedEntity={selectedEntity}
          unifiedLayoutProps={modifiedProps}
          availableHeight={availableHeight}
          updateKey={updateKey}
        />
      </div>
    </div>
  );
};

interface SingleEntityOverlayProps {
  entityKey: EntityKeys;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  overrides?: Partial<Parameters<typeof getUnifiedLayoutProps>[0]>;
  className?: string;
  title?: string;
}

export const SingleEntityOverlay: React.FC<SingleEntityOverlayProps> = ({
  entityKey,
  isOpen,
  onOpenChange,
  trigger,
  overrides = {},
  className,
  title,
}) => {
  const layoutProps = useMemo(() => {
    return getUnifiedLayoutProps({
      entityKey: entityKey,
      formComponent: "ARMANI_LAYOUT",
      quickReferenceType: "LIST",
      density: "normal",
      isExpanded: true,
      handlers: {},
      ...overrides,
    });
  }, [entityKey, overrides]);

  const displayTitle =
    title ||
    `${entityKey.charAt(0).toUpperCase() + entityKey.slice(1)} Management`;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "w-[95vw] sm:w-[80vw] h-[85dvh] sm:h-[80dvh] max-w-none p-0 gap-0 flex flex-col",
          className,
        )}
      >
        <DialogTitle className="sr-only">{displayTitle}</DialogTitle>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SingleEntityLayout {...layoutProps} className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
};
