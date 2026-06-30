"use client";

import { useState, useEffect } from "react";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ViewId } from "./custom-views/view-registry";
import ViewRenderer from "./custom-views/ViewRenderer";
import { getDefaultViewId } from "./markdown-coordinator";
import { processMarkdownForRenderingWithCoordinator } from "./markdown-processor-util";

const isClient = typeof window !== "undefined";

interface DirectMarkdownRendererProps {
  markdown: string;
  coordinatorId: string;
  className?: string;
  source?: string;
  sourceId?: string;
  isLoading?: boolean;
  overrideViewId?: ViewId | "default";
}

const DirectMarkdownRenderer = ({
  markdown,
  coordinatorId,
  className = "",
  source,
  sourceId,
  isLoading = false,
  overrideViewId = "default",
}: DirectMarkdownRendererProps) => {
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [ast, setAst] = useState<any>(null);
  const [processedData, setProcessedData] = useState<any>(null);

  const viewId = getDefaultViewId(coordinatorId);

  useEffect(() => {
    if (!isClient || !markdown || !coordinatorId) {
      return;
    }

    const processMarkdown = async () => {
      try {
        const result = await processMarkdownForRenderingWithCoordinator({
          markdown,
          coordinatorId,
        });
        setAst(result.ast);
        setProcessedData(result.processedData);
        setError(null);
      } catch (err) {
        setError(`Error processing markdown: ${err}`);
      }
    };

    processMarkdown();
  }, [markdown, coordinatorId, overrideViewId]);

  useEffect(() => {
    if (!isClient || !source || !sourceId || !processedData) {
      return;
    }

    dispatch(
      brokerActions.setValue({
        brokerId: `${coordinatorId}-${sourceId}`,
        value: processedData.extracted,
      }),
    );

    // Only dispatch miscellaneous data if it exists and has content
    if (processedData.miscellaneous) {
      const hasMiscContent = Array.isArray(processedData.miscellaneous)
        ? processedData.miscellaneous.length > 0
        : typeof processedData.miscellaneous === "object"
          ? Object.keys(processedData.miscellaneous).length > 0
          : Boolean(processedData.miscellaneous);

      if (hasMiscContent) {
        dispatch(
          brokerActions.setValue({
            brokerId: `${coordinatorId}-${sourceId}-miscellaneous`,
            value: processedData.miscellaneous,
          }),
        );
      }
    }

    dispatch(
      brokerActions.setValue({
        brokerId: `${coordinatorId}-${sourceId}-ast`,
        value: ast,
      }),
    );
  }, [source, sourceId, processedData, viewId, dispatch, coordinatorId, ast]);

  if (error) {
    return (
      <div className={`text-red-600 dark:text-red-400 ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <ViewRenderer
      data={processedData}
      coordinatorId={coordinatorId}
      requestedViewId={viewId ?? undefined}
      className={className}
      isLoading={isLoading}
    />
  );
};

export default DirectMarkdownRenderer;
