"use client";
import React, { useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import FullScreenOverlay from "@/components/official/FullScreenOverlay";
import AccordionWrapper from "@/components/matrx/matrx-collapsible/AccordionWrapper";
import TaskDataDebug from "@/components/socket-io/form-builder/TaskDataDebug";
import { getAllFieldPaths } from "@/constants/socket-schema";
import type { RootState } from "@/lib/redux/store";
import FancyJsonExplorer from "@/features/scraper/parts/FancyJsonExplorer";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import BookmarkViewer from "@/features/scraper/parts/BookmarkViewer";
import {
  selectTaskResponsesByTaskId,
  selectPrimaryResponseDataByTaskId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/lib/redux/socket-io/selectors/socket-task-selectors";

export interface DebugModalProps {
  taskId: string;
  debugMode?: boolean;
}

const SocketDebugModal: React.FC<DebugModalProps> = ({
  taskId,
  debugMode = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const taskState = useAppSelector((state: RootState) =>
    selectTaskById(state, taskId),
  );
  const allFieldPaths = getAllFieldPaths(taskState?.taskName || "");

  const allResponses = useAppSelector((state: RootState) =>
    selectTaskResponsesByTaskId(taskId)(state),
  );
  const dataResponse = useAppSelector((state: RootState) =>
    selectPrimaryResponseDataByTaskId(taskId)(state),
  );

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const tabs = [
    {
      id: "raw-task-state",
      label: "Raw Task State",
      content: (
        <div className="p-4">
          <AccordionWrapper
            title="Raw Task State"
            value="raw-task-state"
            defaultOpen={true}
            className="border border-zinc-200 dark:border-zinc-700 rounded-3xl"
          >
            {taskState ? (
              <pre className="bg-inherit text-inherit p-4 rounded text-sm whitespace-pre-wrap">
                {JSON.stringify(taskState, null, 2)}
              </pre>
            ) : (
              <p className="bg-inherit text-inherit">
                No task state available. Create a task to view its state.
              </p>
            )}
          </AccordionWrapper>
        </div>
      ),
    },
    {
      id: "field-paths",
      label: "Field Paths",
      content: (
        <div className="p-4">
          <AccordionWrapper
            title="Field Paths"
            value="field-paths"
            defaultOpen={true}
            className="border border-zinc-200 dark:border-zinc-700 rounded-3xl"
          >
            {allFieldPaths.length > 0 ? (
              <pre className="bg-inherit text-inherit p-4 rounded text-sm whitespace-pre-wrap">
                {JSON.stringify(allFieldPaths, null, 2)}
              </pre>
            ) : (
              <p className="bg-inherit text-inherit">
                No field paths available. Create a task to view its field paths.
              </p>
            )}
          </AccordionWrapper>
        </div>
      ),
    },
    {
      id: "task-state",
      label: "Task State",
      content: (
        <div className="p-4">
          <AccordionWrapper
            title="Task State"
            value="task-state"
            defaultOpen={true}
            className="border border-zinc-200 dark:border-zinc-700 rounded-3xl"
          >
            <TaskDataDebug taskId={taskId} show={debugMode} />
          </AccordionWrapper>
        </div>
      ),
    },
    {
      id: "fancy-task-data",
      label: "Fancy Json Explorer",
      content: (
        <div className="p-4">
          <FancyJsonExplorer pageData={allResponses} />
        </div>
      ),
    },
    {
      id: "raw-task-data",
      label: "Raw Json Explorer (Data)",
      content: (
        <div className="p-4">
          <RawJsonExplorer pageData={dataResponse} />
        </div>
      ),
    },
    {
      id: "bookmarks",
      label: "Bookmark Viewer",
      content: (
        <div className="p-4">
          <BookmarkViewer pageData={allResponses} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="flex items-center gap-1"
        title="Open Debug Panel"
      >
        <Bug className="h-4 w-4" />
        <span className="sr-only">Debug</span>
      </Button>

      <FullScreenOverlay
        isOpen={isOpen}
        onClose={handleClose}
        title="Debug Panel"
        description="Detailed debugging information for the current task"
        tabs={tabs}
        initialTab="raw-task-state"
        width="90vw"
        height="90dvh"
      />
    </>
  );
};

export default SocketDebugModal;
