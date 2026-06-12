"use client";
import React, { useState } from "react";
import { SocketPresetResponseProps } from "../SocketPresetManager";
import { SocketTasksTab } from "./admin-tabs/SocketTasksTab";
import { SocketTextResponseTab } from "./admin-tabs/SocketTextResponseTab";
import { SocketDataResponseTab } from "./admin-tabs/SocketDataResponseTab";
import { SocketDataProcessorExtractor } from "./admin-tabs/SocketDataProcessorExtractor";
import FullScreenOverlay, { TabDefinition } from "@/components/official/FullScreenOverlay";
import SocketInfoResponseTab from "./admin-tabs/SocketInfoResponseTab";
import SocketErrorResponseTab from "./admin-tabs/SocketErrorResponseTab";
import { SocketBookmarkTab, BookmarkTabConfig } from "./admin-tabs/SocketBookmarkTab";
import { DualSidebar, TaskSidebarComponent } from "./admin-tabs/components/DualSidebar";
import {
    InfoResponseItemComponent,
    ErrorResponseItemComponent,
    TextResponseItemComponent,
    DataResponseItemComponent,
    WorkflowSummaryItemComponent,
    StepCompletionItemComponent,
    LoadingWorkItemComponent,
} from "./admin-tabs/components/ResultsSidebar";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
    selectPrimaryResponseDataByTaskId,
    selectPrimaryResponseErrorsByTaskId,
    selectPrimaryResponseInfoByTaskId,
    selectPrimaryResponseTextByTaskId,
    selectPrimaryResponseEndedByTaskId,
    selectPrimaryCombinedTextByTaskId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { DynamicTab } from "./admin-tabs/DynamicTab";
import { useRenderCount } from "@uidotdev/usehooks";

// Define available base tab names
export type BaseTabName = "tasks" | "text" | "data" | "data-processor" | "info" | "errors" | "dynamic";

// Header component props interface
export interface HeaderComponentProps {
    selectedTaskId: string | null;
    selectedDataType: "data" | "text" | "info" | "error";
    responseIndex: number;
    taskEnded: boolean;
    hasValidText: boolean;
    hasValidData: boolean;
    hasValidInfo: boolean;
    hasValidError: boolean;
    currentResponseArray: any[];
    onDataTypeChange: (type: "data" | "text" | "info" | "error") => void;
    onResponseIndexChange: (index: number) => void;
}

export type HeaderComponent = React.FC<HeaderComponentProps>;


const LOCAL_DEBUG = false;


export interface SocketAdminOverlayProps extends SocketPresetResponseProps {
    // Override props for admin overlay
    overlayTitle?: string;
    overlayDescription?: string;
    showOverlay?: boolean;
    onClose?: () => void;
    customTabs?: BookmarkTabConfig[];

    // New prop to control which base tabs to include
    includeTabs?: BaseTabName[];

    // Pass-through props for FullScreenOverlay customization
    width?: string;
    height?: string;
    initialTab?: string;
    leftSidePanelRatio?: number;
    showLeftSidePanel?: boolean;

    // Custom component overrides
    HeaderComponent?: HeaderComponent;
    TaskSidebarComponent?: TaskSidebarComponent;
    InfoResponseItemComponent?: InfoResponseItemComponent;
    ErrorResponseItemComponent?: ErrorResponseItemComponent;
    TextResponseItemComponent?: TextResponseItemComponent;
    DataResponseItemComponent?: DataResponseItemComponent;
    WorkflowSummaryItemComponent?: WorkflowSummaryItemComponent;
    StepCompletionItemComponent?: StepCompletionItemComponent;
    LoadingWorkItemComponent?: LoadingWorkItemComponent;

    // DualSidebar customization
    dualSidebarClassName?: string;
    dualSidebarSplitRatio?: [number, number];
}

export const SocketAdminOverlay: React.FC<SocketAdminOverlayProps> = ({
    taskId,
    isExecuting = false,
    error,
    overlayTitle = "Socket Admin Panel",
    overlayDescription = "Full access to all socket tasks and responses",
    showOverlay = false,
    onClose,
    customTabs = [],
    includeTabs, // If undefined, all tabs will be shown

    // FullScreenOverlay customization props
    width = "95vw",
    height = "95dvh",
    initialTab = "tasks",
    leftSidePanelRatio = 0.2,
    showLeftSidePanel = true,

    // Custom component overrides
    HeaderComponent,
    TaskSidebarComponent,
    InfoResponseItemComponent,
    ErrorResponseItemComponent,
    TextResponseItemComponent,
    DataResponseItemComponent,
    WorkflowSummaryItemComponent,
    StepCompletionItemComponent,
    LoadingWorkItemComponent,

    // DualSidebar customization
    dualSidebarClassName,
    dualSidebarSplitRatio,
}) => {
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskId);
    // Header controls state
    const [selectedDataType, setSelectedDataType] = useState<"data" | "text" | "info" | "error">("text");
    const [responseIndex, setResponseIndex] = useState<number>(0);

    // Cache for hasValidText per task ID to prevent re-renders on text content changes
    const hasValidTextCacheRef = React.useRef<Map<string, boolean>>(new Map());

    // Get response data based on selected task (not just the initial taskId)
    const dataResponse = useAppSelector((state) => selectPrimaryResponseDataByTaskId(selectedTaskId)(state));
    const infoResponse = useAppSelector((state) => selectPrimaryResponseInfoByTaskId(selectedTaskId)(state));
    const errorsResponse = useAppSelector((state) => selectPrimaryResponseErrorsByTaskId(selectedTaskId)(state));
    const taskEnded = useAppSelector((state) => selectPrimaryResponseEndedByTaskId(selectedTaskId)(state));

    // Only check text response if we haven't already confirmed it has valid text for this task
    const shouldCheckTextResponse = selectedTaskId && !hasValidTextCacheRef.current.get(selectedTaskId);
    const textResponseForValidation = useAppSelector((state) =>
        shouldCheckTextResponse ? selectPrimaryCombinedTextByTaskId(selectedTaskId)(state) : null
    );

    // Use showOverlay prop to control visibility
    const isOverlayOpen = showOverlay;

    // Update selected task when new taskId comes in
    React.useEffect(() => {
        if (taskId) {
            setSelectedTaskId(taskId);
        }
    }, [taskId]);

    // Clear cache for old task IDs to prevent memory leaks
    React.useEffect(() => {
        const cache = hasValidTextCacheRef.current;
        const maxCacheSize = 50; // Keep cache size reasonable

        if (cache.size > maxCacheSize) {
            // Keep only the most recent entries (simple cleanup)
            const entries = Array.from(cache.entries());
            cache.clear();
            // Keep the last 25 entries
            entries.slice(-25).forEach(([key, value]) => {
                cache.set(key, value);
            });
        }
    }, [selectedTaskId]);

    const handleClose = (e?: React.MouseEvent) => {
        e?.stopPropagation(); // Prevent event bubbling
        onClose?.();
    };

    // Calculate hasValidText using cached approach to prevent re-renders
    const hasValidText = React.useMemo(() => {
        if (!selectedTaskId) return false;

        // Check if we already have a cached result for this task
        if (hasValidTextCacheRef.current.has(selectedTaskId)) {
            return hasValidTextCacheRef.current.get(selectedTaskId)!;
        }

        // If we have text response data to validate, check it
        if (textResponseForValidation && textResponseForValidation.length >= 2) {
            hasValidTextCacheRef.current.set(selectedTaskId, true);
            return true;
        }

        return false;
    }, [selectedTaskId, textResponseForValidation]);


    const renderCount = useRenderCount();

    if (LOCAL_DEBUG) {
        console.log("[SOCKET ADMIN OVERLAY] renderCount", renderCount);
    }

    // Define all possible base tabs
    const allBaseTabs: Record<BaseTabName, TabDefinition> = {
        tasks: {
            id: "tasks",
            label: "Tasks",
            content: (
                <SocketTasksTab
                    currentTaskId={selectedTaskId}
                    onTaskIdChange={setSelectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                    hasValidText={hasValidText}
                />
            ),
        },
        dynamic: {
            id: "dynamic",
            label: "Dynamic",
            content: (
                <DynamicTab
                    currentTaskId={selectedTaskId}
                    onTaskIdChange={setSelectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },

        text: {
            id: "text",
            label: "Text",
            content: (
                <SocketTextResponseTab
                    taskId={selectedTaskId}
                    onTaskIdChange={setSelectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },
        data: {
            id: "data",
            label: "Data",
            content: (
                <SocketDataResponseTab
                    taskId={selectedTaskId}
                    onTaskIdChange={setSelectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },
        "data-processor": {
            id: "data-processor",
            label: "Data 2",
            content: (
                <SocketDataProcessorExtractor
                    taskId={selectedTaskId}
                    onTaskIdChange={setSelectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },
        info: {
            id: "info",
            label: "Info",
            content: (
                <SocketInfoResponseTab
                    taskId={selectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },
        errors: {
            id: "errors",
            label: "Error",
            content: (
                <SocketErrorResponseTab
                    taskId={selectedTaskId}
                    isExecuting={isExecuting}
                    error={error}
                    selectedDataType={selectedDataType}
                    selectedIndex={responseIndex}
                />
            ),
        },
    };

    const tabsToInclude: BaseTabName[] = includeTabs || ["tasks", "text", "data", "data-processor", "info", "errors"];

    const baseTabs: TabDefinition[] = tabsToInclude.filter((tabName) => tabName in allBaseTabs).map((tabName) => allBaseTabs[tabName]);

    const customTabDefinitions: TabDefinition[] = customTabs.map((config, index) => ({
        id: `custom-${index}`,
        label: config.tabName,
        content: (
            <SocketBookmarkTab
                taskId={selectedTaskId}
                onTaskIdChange={setSelectedTaskId}
                config={config}
                isExecuting={isExecuting}
                error={error}
                selectedDataType={selectedDataType}
                selectedIndex={responseIndex}
            />
        ),
    }));

    const tabs: TabDefinition[] = [...baseTabs, ...customTabDefinitions];

    const hasValidData = dataResponse && dataResponse.length > 0;
    const hasValidInfo = infoResponse && infoResponse.length > 0;
    const hasValidError = errorsResponse && errorsResponse.length > 0;

    const validTypes: Array<"text" | "data" | "info" | "error"> = [];
    if (hasValidText) validTypes.push("text");
    if (hasValidData) validTypes.push("data");
    if (hasValidInfo) validTypes.push("info");
    if (hasValidError) validTypes.push("error");

    // Reset selected type if it's no longer valid
    React.useEffect(() => {
        if (validTypes.length > 0 && !validTypes.includes(selectedDataType)) {
            setSelectedDataType(validTypes[0]);
            setResponseIndex(0);
        }
    }, [validTypes.join(","), selectedDataType]);

    // Get current response array for index buttons
    const getCurrentResponseArray = () => {
        switch (selectedDataType) {
            case "data":
                return dataResponse;
            case "info":
                return infoResponse;
            case "error":
                return errorsResponse;
            default:
                return [];
        }
    };

    const currentResponseArray = getCurrentResponseArray();
    const showIndexButtons = selectedDataType !== "text" && currentResponseArray.length > 0;

    const defaultHeaderComponent = (
        <div className="flex items-center gap-4 flex-wrap">
            {/* Task Status Badge - Always show when we have a taskId */}
            {selectedTaskId && (
                <div
                    className={`px-2 py-1 text-xs font-medium rounded-md border ${
                        taskEnded
                            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700"
                            : "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700"
                    }`}
                >
                    {taskEnded ? "Task Ended" : "Task Started"}
                </div>
            )}

            {/* Response Type Toggle - Always show all buttons */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</span>
                <div className="flex gap-1">
                    {(["text", "data", "info", "error"] as const).map((type) => {
                        const isValid =
                            (type === "text" && hasValidText) ||
                            (type === "data" && hasValidData) ||
                            (type === "info" && hasValidInfo) ||
                            (type === "error" && hasValidError);

                        return (
                            <Button
                                key={type}
                                variant={selectedDataType === type ? "default" : "outline"}
                                size="sm"
                                disabled={!isValid}
                                onClick={() => {
                                    if (isValid) {
                                        setSelectedDataType(type);
                                        setResponseIndex(0); // Reset index when switching types
                                    }
                                }}
                                className="px-2 py-1 text-xs h-7"
                            >
                                {type}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {/* Response Index Buttons */}
            {showIndexButtons && (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Response:</span>
                    <div className="flex gap-1">
                        {currentResponseArray.map((_, index) => (
                            <Button
                                key={index}
                                variant={responseIndex === index ? "default" : "outline"}
                                size="sm"
                                onClick={() => setResponseIndex(index)}
                                className="px-2 py-1 text-xs h-7"
                            >
                                {index + 1}
                            </Button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const headerComponent = HeaderComponent ? (
        <HeaderComponent
            selectedTaskId={selectedTaskId}
            selectedDataType={selectedDataType}
            responseIndex={responseIndex}
            taskEnded={taskEnded}
            hasValidText={hasValidText}
            hasValidData={hasValidData}
            hasValidInfo={hasValidInfo}
            hasValidError={hasValidError}
            currentResponseArray={currentResponseArray}
            onDataTypeChange={(type) => {
                setSelectedDataType(type);
                setResponseIndex(0);
            }}
            onResponseIndexChange={setResponseIndex}
        />
    ) : (
        defaultHeaderComponent
    );

    const actualInitialTab = tabs.find((tab) => tab.id === initialTab)?.id || tabs[0]?.id || "tasks";

    if (!isOverlayOpen) {
        return null;
    }

    return (
        <FullScreenOverlay
            isOpen={isOverlayOpen}
            onClose={handleClose}
            title={overlayTitle}
            description={overlayDescription}
            tabs={tabs}
            initialTab={actualInitialTab}
            width={width}
            height={height}
            sharedHeader={headerComponent}
            leftSidePanelRatio={leftSidePanelRatio}
            leftSidePanel={
                showLeftSidePanel ? (
                    <DualSidebar
                        selectedTaskId={selectedTaskId}
                        onTaskSelect={setSelectedTaskId}
                        selectedDataType={selectedDataType}
                        selectedIndex={responseIndex}
                        onDataTypeChange={(dataType, index) => {
                            setSelectedDataType(dataType);
                            setResponseIndex(index || 0);
                        }}
                        className={dualSidebarClassName}
                        splitRatio={dualSidebarSplitRatio}
                        hasValidText={hasValidText}
                        TaskSidebarComponent={TaskSidebarComponent}
                        InfoResponseItemComponent={InfoResponseItemComponent}
                        ErrorResponseItemComponent={ErrorResponseItemComponent}
                        TextResponseItemComponent={TextResponseItemComponent}
                        DataResponseItemComponent={DataResponseItemComponent}
                        WorkflowSummaryItemComponent={WorkflowSummaryItemComponent}
                        StepCompletionItemComponent={StepCompletionItemComponent}
                        LoadingWorkItemComponent={LoadingWorkItemComponent}
                    />
                ) : undefined
            }
        />
    );
};

export default SocketAdminOverlay;
