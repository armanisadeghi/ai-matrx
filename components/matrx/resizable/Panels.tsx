"use client";

// PanelLeft.jsx
import React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import PanelContent from "./dev/PanelContent";
import { pct } from "@/components/matrx/resizable/pct";
import type { Layout } from "react-resizable-panels";

const ID_LEFT_MAIN = "panels-left-main";
const ID_LEFT_SPACER = "panels-left-spacer";
const ID_RIGHT_SPACER = "panels-right-spacer";
const ID_RIGHT_MAIN = "panels-right-main";
const ID_TOP_MAIN = "panels-top-main";
const ID_TOP_SPACER = "panels-top-spacer";
const ID_BOTTOM_SPACER = "panels-bottom-spacer";
const ID_BOTTOM_MAIN = "panels-bottom-main";

export const PanelLeft = ({
  header,
  headerProps,
  children,
  defaultSize = 20,
  minSize = 1,
  maxSize = 99,
  onResize,
}: {
  header?: React.ReactNode;
  headerProps?: object;
  children?: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  onResize?: (layout: Layout) => void;
}) => {
  return (
    <div className="fixed inset-0 z-50" data-testid="panel-container-left">
      <ResizablePanelGroup
        orientation="horizontal"
        className="w-screen h-dvh min-h-0"
        onLayoutChanged={onResize}
      >
        <ResizablePanel
          id={ID_LEFT_MAIN}
          defaultSize={pct(defaultSize)}
          minSize={pct(minSize)}
          maxSize={pct(maxSize)}
        >
          <PanelContent
            position="left"
            header={header}
            headerProps={headerProps}
          >
            {children}
          </PanelContent>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          id={ID_LEFT_SPACER}
          defaultSize={pct(100 - defaultSize)}
        >
          <div className="h-full" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

// PanelRight.jsx
export const PanelRight = ({
  header,
  headerProps,
  children,
  defaultSize = 20,
  minSize = 1,
  maxSize = 99,
  onResize,
}: {
  header?: React.ReactNode;
  headerProps?: object;
  children?: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  onResize?: (layout: Layout) => void;
}) => {
  return (
    <div className="fixed inset-0 z-50" data-testid="panel-container-right">
      <ResizablePanelGroup
        orientation="horizontal"
        className="w-screen h-dvh min-h-0"
        onLayoutChanged={onResize}
      >
        <ResizablePanel
          id={ID_RIGHT_SPACER}
          defaultSize={pct(100 - defaultSize)}
        >
          <div className="h-full" />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          id={ID_RIGHT_MAIN}
          defaultSize={pct(defaultSize)}
          minSize={pct(minSize)}
          maxSize={pct(maxSize)}
        >
          <PanelContent
            position="right"
            header={header}
            headerProps={headerProps}
          >
            {children}
          </PanelContent>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

// PanelTop.jsx
export const PanelTop = ({
  header,
  headerProps,
  children,
  defaultSize = 20,
  minSize = 1,
  maxSize = 99,
  onResize,
}: {
  header?: React.ReactNode;
  headerProps?: object;
  children?: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  onResize?: (layout: Layout) => void;
}) => {
  return (
    <div className="fixed inset-0 z-50" data-testid="panel-container-top">
      <ResizablePanelGroup
        orientation="vertical"
        className="w-screen h-dvh min-h-0"
        onLayoutChanged={onResize}
      >
        <ResizablePanel
          id={ID_TOP_MAIN}
          defaultSize={pct(defaultSize)}
          minSize={pct(minSize)}
          maxSize={pct(maxSize)}
        >
          <PanelContent
            position="top"
            header={header}
            headerProps={headerProps}
          >
            {children}
          </PanelContent>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id={ID_TOP_SPACER} defaultSize={pct(100 - defaultSize)}>
          <div className="h-full" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

// PanelBottom.jsx
export const PanelBottom = ({
  header,
  headerProps,
  children,
  defaultSize = 20,
  minSize = 1,
  maxSize = 99,
  onResize,
}: {
  header?: React.ReactNode;
  headerProps?: object;
  children?: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  onResize?: (layout: Layout) => void;
}) => {
  return (
    <div className="fixed inset-0 z-50" data-testid="panel-container-bottom">
      <ResizablePanelGroup
        orientation="vertical"
        className="w-screen h-dvh min-h-0"
        onLayoutChanged={onResize}
      >
        <ResizablePanel
          id={ID_BOTTOM_SPACER}
          defaultSize={pct(100 - defaultSize)}
        >
          <div className="h-full" />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          id={ID_BOTTOM_MAIN}
          defaultSize={pct(defaultSize)}
          minSize={pct(minSize)}
          maxSize={pct(maxSize)}
        >
          <PanelContent
            position="bottom"
            header={header}
            headerProps={headerProps}
          >
            {children}
          </PanelContent>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
