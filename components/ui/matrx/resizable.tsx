"use client";

/**
 * HOST BINDING ONLY — the Resizable family lives in
 * `@ai-matrx/design-system`. This file binds the ONE thing that made it a
 * separate fork from `components/ui/resizable.tsx`: its default handle
 * thickness is `md` (8px), not the package default `sm` (2px).
 *
 * Its eight-step scale IS the package's `ResizableHandleSize`, so every
 * `size=` at a call site here keeps working unchanged; `HandleSize` remains
 * exported as an alias for the same union.
 *
 * Do not re-fork this. If a panel needs different geometry, pass `size`.
 */

import {
  ResizableHandle as PackageResizableHandle,
  type ResizableHandleProps,
  type ResizableHandleSize,
} from "@ai-matrx/design-system";
import * as React from "react";

export {
  ResizablePanel,
  ResizablePanelGroup,
  type ResizableHandleProps,
} from "@ai-matrx/design-system";

export type HandleSize = ResizableHandleSize;

export const ResizableHandle = ({
  size = "md",
  ...props
}: ResizableHandleProps) => (
  <PackageResizableHandle size={size} {...props} />
);
ResizableHandle.displayName = "ResizableHandle";
