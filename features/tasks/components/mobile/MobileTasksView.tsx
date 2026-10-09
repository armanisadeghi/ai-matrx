"use client";

import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSelectedTaskId,
  setSelectedTaskId,
} from "@/features/tasks/redux/taskUiSlice";
import { selectAllTasksFlat } from "@/features/tasks/redux/selectors";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Button } from "@/components/ui/button";
import { StaleDataNotice } from "@ai-matrx/design-system";
import MobileTasksList from "./MobileTasksList";
import MobileTaskDetails from "./MobileTaskDetails";

interface MobileTaskDetailsLoaderProps {
  taskId: string;
  onBack: () => void;
  onRetry: () => void;
}

function MobileTaskDetailsLoader({
  taskId,
  onBack,
  onRetry,
}: MobileTaskDetailsLoaderProps) {
  const tasks = useAppSelector(selectAllTasksFlat);
  const task = tasks.find((candidate) => candidate.id === taskId);
  const { isFullData, loading, metadataPending, missing } =
    useEnsureTaskLoaded(taskId);

  if (task && isFullData) {
    return <MobileTaskDetails task={task} onBack={onBack} />;
  }

  const readFailed = !loading && !metadataPending;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <Button
          icon={<ChevronLeft />}
          variant="quiet"
          onClick={onBack}
          aria-label="Back to tasks"
          className="shrink-0"
        />
        <Skeleton className="h-5 w-48 max-w-[60vw]" />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4" role="status">
        {missing ? (
          // A deep link to a task this viewer cannot see is an access answer,
          // not a failed load — the gate names the true cause.
          <AccessGate
            token="task"
            id={taskId}
            fallbackHref="/tasks"
            fallbackLabel="Back to Tasks"
          />
        ) : readFailed ? (
          <StaleDataNotice
            hasData={false}
            what="task details"
            onRetry={onRetry}
          />
        ) : (
          <>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </>
        )}
      </div>
    </div>
  );
}

export default function MobileTasksView() {
  // The ONE selection — the same Redux value `TaskUrlSync` bridges to
  // `?task=`. A local copy here meant a phone ignored deep links and Back.
  const dispatch = useAppDispatch();
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const currentView = selectedTaskId ? "details" : "tasks";
  const [detailLoadAttempt, setDetailLoadAttempt] = useState(0);

  const handleTaskSelect = (taskId: string) => {
    setDetailLoadAttempt(0);
    dispatch(setSelectedTaskId(taskId));
  };

  const handleBack = () => {
    dispatch(setSelectedTaskId(null));
  };

  return (
    <div className="matrx-touch-targets h-full w-full bg-background overflow-hidden relative touch-pan-y">
      {/* Tasks List View */}
      <div
        className={`absolute inset-0 transition-transform duration-300 ease-in-out overflow-hidden ${
          currentView === "tasks" ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <MobileTasksList onTaskSelect={handleTaskSelect} />
      </div>

      {/* Task Details View */}
      <div
        className={`absolute inset-0 transition-transform duration-300 ease-in-out overflow-hidden ${
          currentView === "details" ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedTaskId && (
          <MobileTaskDetailsLoader
            key={`${selectedTaskId}:${detailLoadAttempt}`}
            taskId={selectedTaskId}
            onBack={handleBack}
            onRetry={() => setDetailLoadAttempt((attempt) => attempt + 1)}
          />
        )}
      </div>
    </div>
  );
}
