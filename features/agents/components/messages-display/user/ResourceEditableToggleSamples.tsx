"use client";

/**
 * ResourceEditableToggleSamples — shows EVERY resource type together in the
 * real SmartAgentResourceChips, so the read-only ↔ editable toggle can be
 * confirmed alongside the chips that don't have the feature.
 *
 * Editable-capable types (notes, task, table, list, data, webpage) render a
 * Lock/Pencil toggle in the right control column; everything else just shows
 * the remove control. On touch devices, long-press any chip for a full-size
 * action menu. Dev-only.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { SmartAgentResourceChips } from "@/features/agents/components/inputs/resources/SmartAgentResourceChips";
import {
  initInstanceResources,
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { initInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import {
  DEMO_CONV_ALL_RESOURCES,
  DEMO_ALL_RESOURCES,
} from "./userMessageChipsDemoData";

export function ResourceEditableToggleSamples() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(
      initInstanceResources({ conversationId: DEMO_CONV_ALL_RESOURCES }),
    );
    dispatch(
      initInstanceUIState({
        conversationId: DEMO_CONV_ALL_RESOURCES,
        showAttachments: true,
      }),
    );
    for (const resource of DEMO_ALL_RESOURCES) {
      dispatch(
        addResource({
          conversationId: DEMO_CONV_ALL_RESOURCES,
          resourceId: resource.resourceId,
          blockType: resource.blockType,
          source: resource.source,
          options: isEditableCapableBlockType(resource.blockType)
            ? { editable: true }
            : undefined,
        }),
      );
      dispatch(
        setResourcePreview({
          conversationId: DEMO_CONV_ALL_RESOURCES,
          resourceId: resource.resourceId,
          preview: resource.preview,
        }),
      );
    }
  }, [dispatch]);

  return (
    <div className="space-y-3">
      <div className="space-y-1 border-b border-border pb-2">
        <h2 className="text-base font-semibold text-foreground">
          All attachment chips together
        </h2>
        <p className="text-xs text-muted-foreground max-w-3xl">
          The real <code className="text-[10px]">SmartAgentResourceChips</code>{" "}
          with one of every resource type. Editable-capable types (Note, Task,
          Table, List, Data, Webpage) show the Lock/Pencil toggle in the right
          control column; files, media, YouTube, and text show the remove
          control only. Click a lock/pencil to toggle, ✕ to remove, hover a chip
          for its preview. On a touch device, long-press any chip for a
          full-size menu. Read-only is the default (no{" "}
          <code className="text-[10px]">editable</code> on the wire); editable
          sends <code className="text-[10px]">editable: true</code>.
        </p>
      </div>

      <div className="bg-muted border border-border rounded-lg py-2 max-w-3xl">
        <SmartAgentResourceChips conversationId={DEMO_CONV_ALL_RESOURCES} />
      </div>
    </div>
  );
}
