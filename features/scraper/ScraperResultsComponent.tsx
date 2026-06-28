"use client";
import React, { useState, useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isScraperLoading } from "./utils/scraper-utils";
import ScraperDataUtils from "./utils/data-utils";
import PageTabs from "./parts/core/PageTabs";
import PageContent from "./parts/core/PageContent";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectPrimaryResponseErrorsByTaskId,
  selectPrimaryResponseDataByTaskId,
  selectPrimaryResponseEndedByTaskId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { selectTaskStatus } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { useRenderCount } from "@uidotdev/usehooks";

interface ScraperResultsComponentProps {
  taskId: string;
}

const LOCAL_DEBUG = true;

const ScraperResultsComponent = ({ taskId }: ScraperResultsComponentProps) => {
  const responses = useAppSelector((state) =>
    selectPrimaryResponseDataByTaskId(taskId)(state),
  );
  const taskStatus = useAppSelector((state) => selectTaskStatus(state, taskId));
  const isTaskCompleted = useAppSelector((state) =>
    selectPrimaryResponseEndedByTaskId(taskId)(state),
  );
  const errors = useAppSelector((state) =>
    selectPrimaryResponseErrorsByTaskId(taskId)(state),
  );

  const renderCount = useRenderCount();

  if (LOCAL_DEBUG) {
    console.log("[SOCKET ADMIN OVERLAY] renderCount", renderCount);
  }

  const isLoading = taskStatus === "submitted" && !isTaskCompleted;

  const [activePageIndex, setActivePageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("pretty");

  // Process responses using the new ScraperDataUtils system
  const processedData = useMemo(() => {
    if (!responses || responses.length === 0) {
      return null;
    }

    // Filter out initialization messages (keeping legacy logic)
    const contentResponses = responses.filter((response) => {
      if (!response) return false;

      // Skip initialization messages
      if (
        typeof response === "object" &&
        response.status === "success" &&
        response.message === "initialized"
      ) {
        return false;
      }

      return true;
    });

    const processedResponses = contentResponses
      .map((response, index) => {
        try {
          // Check if this is already in the new format
          if (
            response &&
            typeof response === "object" &&
            (response.response_type === "scraped_pages" ||
              response.response_type === "fetch_results")
          ) {
            console.log(
              `[SCRAPER RESULTS] Response ${index} is already in new format`,
            );
            return ScraperDataUtils.processFullData(response);
          }

          // Handle legacy format by processing with the new utils
          const processed = ScraperDataUtils.processFullData(response);
          console.log(
            `[SCRAPER RESULTS] Processed legacy response ${index}:`,
            processed,
          );
          return processed;
        } catch (error) {
          console.error(
            `[SCRAPER RESULTS] Error processing response ${index}:`,
            error,
          );
          return null;
        }
      })
      .filter(Boolean);

    // TODO: Create component for metadata visualization
    processedResponses.forEach((processed, index) => {
      if (processed.metadata && Object.keys(processed.metadata).length > 0) {
        console.log(
          `[SCRAPER RESULTS] Metadata for response ${index}:`,
          processed.metadata,
        );
        // TODO: Create MetadataOverview component
      }
    });

    return processedResponses;
  }, [responses]);

  // Check if we have any responses
  if (!processedData || processedData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <Alert className="w-full max-w-2xl">
          <AlertDescription>
            {isLoading
              ? "Processing web page..."
              : "No page content available."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (errors && errors.length > 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <Alert className="w-full max-w-2xl">
          <AlertDescription>
            {errors
              .map((error) => error.user_message ?? error.user_visible_message)
              .filter(Boolean)
              .join(", ")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-0">
      {/* Page tabs - Only show if multiple pages */}
      <PageTabs
        responses={processedData}
        activePageIndex={activePageIndex}
        setActivePageIndex={setActivePageIndex}
      />

      {/* Main content area */}
      <div className="flex-1 min-h-0">
        {processedData.length > 0 && activePageIndex < processedData.length ? (
          <PageContent
            pageData={processedData[activePageIndex]}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            dataUtils={ScraperDataUtils}
          />
        ) : (
          <div className="p-4 text-muted-foreground">No content available</div>
        )}
      </div>
    </div>
  );
};

export default ScraperResultsComponent;
