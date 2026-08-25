import * as React from "react";

import { cn } from "@/lib/utils";

export type KindKitIcon =
  | React.ComponentType<{ className?: string }>
  | React.ReactElement<{ className?: string }>;

/**
 * Babel-sandbox imports normally bind a component directly, but an ESM/CJS
 * interop boundary may hand us `{ default: Component }`. React reports that
 * wrapper as error #130 if it is passed to createElement unchanged.
 */
function resolveIconType(icon: unknown): React.ElementType | null {
  if (typeof icon === "function") return icon as React.ElementType;
  if (typeof icon !== "object" || icon === null) return null;

  const candidate = icon as Record<PropertyKey, unknown>;
  if (typeof candidate.$$typeof === "symbol") {
    return icon as React.ElementType;
  }
  if ("default" in candidate && candidate.default !== icon) {
    return resolveIconType(candidate.default);
  }
  return null;
}

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
  const Icon = resolveIconType(icon);
  return Icon ? React.createElement(Icon, { className }) : null;
}
