"use client";

import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllTasksFlat } from "@/features/tasks/redux/selectors";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { Button } from "@/components/ui/button";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import MobileTasksList from "./MobileTasksList";
import MobileTaskDetails from "./MobileTaskDetails";

type MobileView = "tasks" | "details";

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
  const { isFullData, loading, metadataPending } = useEnsureTaskLoaded(taskId);

  if (task && isFullData) {
    return <MobileTaskDetails task={task} onBack={onBack} />;
  }

  const readFailed = !loading && !metadataPending;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to tasks"
          className="h-11 w-11 shrink-0 rounded-full"
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Button>
        <Skeleton className="h-5 w-48 max-w-[60vw]" />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4" role="status">
        {readFailed ? (
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
  const [currentView, setCurrentView] = useState<MobileView>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailLoadAttempt, setDetailLoadAttempt] = useState(0);

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDetailLoadAttempt(0);
    setCurrentView("details");
  };

  const handleBack = () => {
    setCurrentView("tasks");
    setSelectedTaskId(null);
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
