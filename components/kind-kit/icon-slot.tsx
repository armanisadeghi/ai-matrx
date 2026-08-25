import * as React from "react";

import { cn } from "@/lib/utils";

export type KindKitIcon =
  | React.ComponentType<{ className?: string }>
  | React.ReactElement<{ className?: string }>;

/** Render either icon authoring form without treating an element as a component type. */
export function renderKindKitIcon(
  icon: KindKitIcon | undefined,
  className: string,
): React.ReactElement | null {
  if (!icon) return null;
  if (React.isValidElement<{ className?: string }>(icon)) {
    return React.cloneElement(icon, {
      className: cn(className, icon.props.className),
    });
  }
  return React.createElement(icon, { className });
}
