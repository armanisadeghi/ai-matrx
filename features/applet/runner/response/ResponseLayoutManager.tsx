"use client";

import React, { useMemo, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";
import FullscreenWrapper from "@/components/matrx/FullscreenWrapper";
import AppletLayoutManager from "@/features/applet/runner/layouts/AppletLayoutManager";
import AppletPostActionButtons from "./AppletPostActionButtons";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { hasCoordinator } from "@/components/mardown-display/markdown-classification/markdown-coordinator";
import DirectMarkdownRenderer from "@/components/mardown-display/markdown-classification/DirectMarkdownRenderer";
import { AppletLayoutOption } from "@/types/customAppTypes";

interface ResponseLayoutManagerProps {
  appletId: string;
  appSlug: string;
  taskId: string;
  coordinatorId: string;
  handleSubmit: () => void;
  isPreview?: boolean;
  responseLayoutTypeOverride?: AppletLayoutOption;
  allowEditing?: boolean;
}

export default function ResponseLayoutManager({
  appletId,
  appSlug,
  taskId,
  coordinatorId,
  handleSubmit,
  isPreview = false,
  responseLayoutTypeOverride = "flat-accordion",
  allowEditing = false,
}: ResponseLayoutManagerProps) {
  const dispatch = useAppDispatch();
  const textResponse = "";
  const dataResponse: unknown[] = [];
  const isTaskComplete = true;
  const hasCustomView = useMemo(
    () => hasCoordinator(coordinatorId),
    [coordinatorId],
  );

  useEffect(() => {
    if (coordinatorId) {
      dispatch(
        brokerActions.setValue({
          brokerId: `APPLET_COORDINATOR_ID`,
          value: coordinatorId,
        }),
      );
    }
  }, [coordinatorId, dispatch]);

  useEffect(() => {
    if (isPreview) {
      dispatch(
        brokerActions.setValue({
          brokerId: `APPLET_PREVIEW_MODE`,
          value: true,
        }),
      );
    }
  }, [isPreview, dispatch, appletId]);

  useEffect(() => {
    if (isTaskComplete) {
      dispatch(
        brokerActions.setValue({
          brokerId: `APPLET_RESPONSE_${appletId}`,
          value: textResponse,
        }),
      );
    }
  }, [isTaskComplete, textResponse, dispatch, appletId]);

  return (
    <div className="w-full px-2 space-y-2">
      <AppletLayoutManager
        appletId={appletId}
        appSlug={appSlug}
        layoutTypeOverride={responseLayoutTypeOverride}
        initialExpanded={false}
        handleSubmit={handleSubmit}
        isPreview={isPreview}
      />
      <div className="space-y-6">
        <FullscreenWrapper
          buttonPosition="top-right-inside"
          expandButtonTitle="View in fullscreen"
          closeButtonTitle="Exit fullscreen"
        >
          <div className="w-full max-w-4xl mx-auto p-4">
            {!hasCustomView && (
              <MarkdownStream
                content={textResponse}
                taskId={taskId}
                className="bg-textured"
                isStreamActive={!isTaskComplete}
                hideCopyButton={true}
              />
            )}
            {hasCustomView && (
              <DirectMarkdownRenderer
                markdown={textResponse}
                coordinatorId={coordinatorId}
                className="bg-textured"
                isLoading={!isTaskComplete}
                source="applet"
                sourceId={appletId}
              />
            )}
          </div>
          {isTaskComplete && (
            <div className="w-full max-w-4xl mx-auto px-4">
              <AppletPostActionButtons
                appletId={appletId}
                taskId={taskId}
                content={textResponse}
                data={dataResponse}
                handleEdit={allowEditing ? () => {} : null}
              />
            </div>
          )}
        </FullscreenWrapper>
      </div>
    </div>
  );
}
