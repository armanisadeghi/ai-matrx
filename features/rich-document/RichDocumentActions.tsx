"use client";

// features/rich-document/RichDocumentActions.tsx
//
// The action bar ALONE — for a surface that renders its own content (a legacy
// message renderer, an editor, a card) but wants the one registry's actions
// inline beside it. Same hook, same bar, same actions as <RichDocument
// actionsVariant="bar"/>; it just does not mount the content engine.

import * as React from "react";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import { ActionBar } from "./variants/ActionBar";
import type { ContentSource, RichDocumentActionsProp } from "./types";

export interface RichDocumentActionsProps {
  content: string;
  source: ContentSource;
  actions?: RichDocumentActionsProp;
  className?: string;
}

export function RichDocumentActions(
  props: RichDocumentActionsProps,
): React.ReactElement {
  const { content, source, actions, className } = props;
  const { ctx, getCtx, resolvedActions } = useActionSurfaceProvider({
    content,
    source,
    actions,
    actionsVariant: "bar",
  });
  return (
    <ActionBar
      actions={resolvedActions}
      getCtx={getCtx}
      sourceId={ctx.instanceKey("alchemy")}
      className={className}
    />
  );
}

export default RichDocumentActions;
