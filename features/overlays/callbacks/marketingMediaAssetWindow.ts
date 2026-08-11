/**
 * Typed return channel for the crawled-media asset window.
 *
 * Only the callback group id crosses Redux. The window can hand the selected
 * asset (or a newly imported brand asset) back to the route that opened it
 * without putting functions or non-serializable state in the overlay payload.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { SnapshotMediaAsset } from "@/features/marketing/lib/snapshot-media";
import type { BrandAsset } from "@/features/marketing/types";

export type MarketingMediaAssetWindowEvent =
  | {
      type: "order-replacement";
      windowInstanceId: string;
      asset: SnapshotMediaAsset;
    }
  | {
      type: "imported-for-edit";
      windowInstanceId: string;
      asset: BrandAsset;
    }
  | {
      type: "window-close";
      windowInstanceId: string;
    };

export interface MarketingMediaAssetWindowHandlers {
  onOrderReplacement?: (
    event: Extract<
      MarketingMediaAssetWindowEvent,
      { type: "order-replacement" }
    >,
  ) => void;
  onImportedForEdit?: (
    event: Extract<
      MarketingMediaAssetWindowEvent,
      { type: "imported-for-edit" }
    >,
  ) => void;
  onWindowClose?: (
    event: Extract<MarketingMediaAssetWindowEvent, { type: "window-close" }>,
  ) => void;
  onEvent?: (event: MarketingMediaAssetWindowEvent) => void;
}

export function createMarketingMediaAssetCallbackGroup(
  handlers: MarketingMediaAssetWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();

  callbackManager.registerWithContext<MarketingMediaAssetWindowEvent>(
    (event) => {
      if (event.type === "order-replacement") {
        handlers.onOrderReplacement?.(event);
      }
      if (event.type === "imported-for-edit") {
        handlers.onImportedForEdit?.(event);
      }
      if (event.type === "window-close") {
        handlers.onWindowClose?.(event);
      }
      handlers.onEvent?.(event);
      if (event.type === "window-close") {
        callbackManager.removeGroup(callbackGroupId);
      }
    },
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitMarketingMediaAssetWindowEvent(
  callbackGroupId: string | null | undefined,
  event: MarketingMediaAssetWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<MarketingMediaAssetWindowEvent>(
    callbackGroupId,
    event,
    { removeAfterTrigger: false },
  );
}
