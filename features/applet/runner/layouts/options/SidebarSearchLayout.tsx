import React, { useState, useEffect } from "react";
import { AppletInputProps } from "@/features/applet/runner/layouts/AppletLayoutManager";
import UniformHeightWrapper from "@/features/applet/runner/layouts/core/UniformHeightWrapper";
import { ChevronRight, Send } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
    selectAppletRuntimeAppletIcon,
    selectAppletRuntimeAccentColor,
    selectAppletRuntimeContainers,
    selectAppletRuntimeName,
} from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { getAppletIcon } from "@/features/applet/styles/StyledComponents";
import FieldsWithLabels from "@/features/applet/runner/fields/core/FieldsWithlabels";

interface SidebarSearchLayoutProps extends AppletInputProps {
    fullWidth?: boolean;
}

const SidebarSearchLayout: React.FC<SidebarSearchLayoutProps> = ({
    appletId,
    activeContainerId,
    setActiveContainerId,
    actionButton,
    className = "",
    isMobile = false,
    fullWidth = false,
    source = "applet",
}) => {
    const appletContainers = useAppSelector((state) => selectAppletRuntimeContainers(state, appletId));
    const appletIconName = useAppSelector((state) => selectAppletRuntimeAppletIcon(state, appletId));
    const appletAccentColor = useAppSelector((state) => selectAppletRuntimeAccentColor(state, appletId));
    const appletName = useAppSelector((state) => selectAppletRuntimeName(state, appletId));
    const appletIcon = getAppletIcon({ icon: appletIconName, color: appletAccentColor, size: 28 });
    const [hoveredContainerId, setHoveredContainerId] = useState<string | null>(null);
    
    // Find current container index to determine if it's the last one
    const currentContainerIndex = appletContainers.findIndex((container) => container.id === activeContainerId);
    const isLastContainer = currentContainerIndex === appletContainers.length - 1;
    
    // Function to navigate to the next container
    const handleNext = () => {
        if (currentContainerIndex < appletContainers.length - 1) {
            setActiveContainerId(appletContainers[currentContainerIndex + 1].id);
        }
    };
    
    // Layout type identifier for UniformHeightWrapper
    const layoutType = fullWidth ? "fullWidthSidebar" : "sidebar";
    
    // Width classes based on layout type
    const containerWidthClass = fullWidth ? "w-full" : "w-full max-w-6xl mx-auto";
    
    // Set first container as active on mount if no active container
    useEffect(() => {
        if (appletContainers.length > 0 && !activeContainerId) {
            setActiveContainerId(appletContainers[0].id);
        }
    }, [appletContainers, activeContainerId, setActiveContainerId]);
    
    return (
        <div
            className={`${containerWidthClass} border rounded-lg overflow-hidden bg-textured dark:border-gray-700 ${className}`}
        >
            <div className="flex flex-col md:flex-row h-full">
                {/* Sidebar */}
                <div className="w-full md:w-64 border-r dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                    <div className="flex items-center mb-6 border-b-2 border-gray-200 dark:border-gray-700 pb-2">
                        <div className="mr-2 flex-shrink-0">{appletIcon}</div>
                        <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 truncate">{appletName}</h3>
                    </div>
                    <div className="space-y-1">
                        {appletContainers.map((container) => (
                            <button
                                key={container.id}
                                onClick={() => setActiveContainerId(container.id)}
                                onMouseEnter={() => setHoveredContainerId(container.id)}
                                onMouseLeave={() => setHoveredContainerId(null)}
                                className={`w-full text-left px-4 py-3 rounded-lg transition ${
                                    activeContainerId === container.id
                                        ? "bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-100"
                                        : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <div className="flex items-center">
                                    <span className="flex-grow">{container.label}</span>
                                    {(activeContainerId === container.id || hoveredContainerId === container.id) && (
                                        <ChevronRight size={16} />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                
                {/* Main content area with relative positioning */}
                <div className="flex-grow p-6 bg-textured relative flex flex-col">
                    {/* Content container with fixed height */}
                    <div className="flex-grow relative" style={{ minHeight: "400px" }}>
                        {appletContainers.map((container) => (
                            <UniformHeightWrapper
                                key={container.id}
                                containerId={container.id}
                                layoutType={layoutType}
                                className={`transition-opacity duration-300 h-full ${
                                    activeContainerId === container.id
                                        ? "opacity-100 visible"
                                        : "opacity-0 invisible absolute top-0 left-0 w-full h-full"
                                }`}
                                enabled={true}
                            >
                                <div className="flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-2xl font-medium text-gray-900 dark:text-gray-100">{container.label}</h2>
                                        {container.description && (
                                            <p className="mt-2 text-gray-600 dark:text-gray-400">{container.description}</p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                        <FieldsWithLabels
                                            fields={container.fields}
                                            sourceId={appletId}
                                            isMobile={isMobile}
                                            source={source}
                                            className="contents"
                                            wrapperClassName="mb-5 last:mb-0"
                                            showLabels={true}
                                            showHelpText={true}
                                            showRequired={true}
                                            labelPosition="top"
                                            labelClassName="mb-2"
                                        />
                                    </div>
                                </div>
                            </UniformHeightWrapper>
                        ))}
                    </div>
                    
                    {/* Footer with action button - always at the bottom */}
                    <div className="flex justify-end">
                        {actionButton ||
                            (isLastContainer ? (
                                <button className="bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-md px-6 py-3 flex items-center">
                                    <span className="mr-2">Submit</span>
                                    <Send size={16} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleNext}
                                    className="bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-md px-6 py-3 flex items-center"
                                >
                                    <span className="mr-2">Next</span>
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const FullWidthSidebarSearchLayout: React.FC<AppletInputProps> = (props) => {
    return <SidebarSearchLayout {...props} fullWidth={true} />;
};

export default SidebarSearchLayout;