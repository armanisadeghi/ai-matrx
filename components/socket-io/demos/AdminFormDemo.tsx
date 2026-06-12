"use client";
import { SocketHeaderFull } from "@/components/socket-io/headers/SocketHeaderFull";
import DynamicForm from "@/components/socket-io/form-builder/DynamicForm";
import { useState } from "react";
import { useMeasure } from "@uidotdev/usehooks";
import { getAllFieldPaths } from "@/constants/socket-schema";
import SocketAccordionResponse from "@/components/socket/response/SocketAccordionResponse";
import AccordionWrapper from "@/components/matrx/matrx-collapsible/AccordionWrapper";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import TaskDebugDisplay from "@/components/socket-io/form-builder/TaskDebugDisplay";

const AdminFormDemo = ({ debugMode }: { debugMode: boolean }) => {
    const [taskId, setTaskId] = useState<string>("");
    const [ref, { width, height }] = useMeasure();
    const taskState = useAppSelector((state) => selectTaskById(state, taskId));
    const taskName = taskState?.taskName || "";
    const allFieldPaths = getAllFieldPaths(taskState?.taskName || "");

    return (
        <div className="flex flex-col max-h-dvh bg-inherit text-inherit">
            <div className="sticky top-0 z-50 bg-inherit text-inherit">
                <SocketHeaderFull onTaskCreate={setTaskId} debugMode={debugMode} />
            </div>

            <div ref={ref} className="flex flex-row flex-1 p-4">
                <div className="w-full overflow-y-auto pr-4 h-full scrollbar-none" style={{ maxHeight: `${height}px` }}>
                    {taskId ? (
                        <AccordionWrapper
                            title={`Config Builder for ${taskName || "Selected Task"}`}
                            value="config-builder"
                            defaultOpen={true}
                        >
                            <DynamicForm taskId={taskId} showDebug={false} />
                        </AccordionWrapper>
                    ) : (
                        <p className="bg-inherit text-inherit">No Tasks Created.</p>
                    )}
                </div>
                <div className="w-full overflow-y-auto px-2 h-full space-y-2 scrollbar-none" style={{ maxHeight: `${height}px` }}>
                    <SocketAccordionResponse taskId={taskId} />
                    
                    {/* Debug Panel - Only show when debug mode is enabled */}
                    {debugMode && taskId && (
                        <AccordionWrapper
                            title="Real-time Task Debug Info"
                            value="debug-info"
                            defaultOpen={false}
                        >
                            <div className="pt-4">
                                <TaskDebugDisplay taskId={taskId} />
                            </div>
                        </AccordionWrapper>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminFormDemo;
