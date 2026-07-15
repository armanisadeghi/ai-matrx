// File: features/applet/layouts/core/VerticalSearchGroup.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ContainerRenderProps } from "../AppletLayoutManager";
import { selectAppletRuntimeContainers, selectAppletRuntimePrimaryColor, selectAppletRuntimeAccentColor } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import FieldsWithLabels from "@/features/applet/runner/fields/core/FieldsWithlabels";
import ContainerHeaderLabel from "@/features/applet/runner/layouts/parts/ContainerHeaders";


const VerticalSearchGroup: React.FC<ContainerRenderProps> = ({
    id,
    label,
    description,
    appletId,
    fields,
    isActive,
    onClick,
    onOpenChange,
    className = "",
    isMobile = false,
    source = "applet",
}) => {
    const appletContainers = useAppSelector((state) => selectAppletRuntimeContainers(state, appletId));
    const appletPrimaryColor = useAppSelector((state) => selectAppletRuntimePrimaryColor(state, appletId));
    const appletAccentColor = useAppSelector((state) => selectAppletRuntimeAccentColor(state, appletId));

    const [expanded, setExpanded] = useState(isActive);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setExpanded(isActive);
    }, [isActive]);

    const handleToggle = () => {
        const newExpandedState = !expanded;
        setExpanded(newExpandedState);
        onClick(id);
        if (!newExpandedState) {
            onOpenChange(false);
        }
    };

    if (!appletPrimaryColor || !appletAccentColor) {
        return null;
    }

    return (
        <div className={`border rounded-lg overflow-hidden bg-${appletPrimaryColor}-50 dark:bg-${appletPrimaryColor}-800 dark:border-${appletPrimaryColor}-700 ${className}`}>
            <button
                className={`w-full flex justify-between items-center p-4 text-left focus:outline-none hover:bg-${appletPrimaryColor}-50 dark:hover:bg-${appletPrimaryColor}-700 ${
                    expanded ? `bg-${appletPrimaryColor}-50 dark:bg-${appletPrimaryColor}-700` : ""
                }`}
                onClick={handleToggle}
            >
                <ContainerHeaderLabel
                    label={label}
                    description={typeof description === "string" ? description : ""}
                    primaryColor={appletPrimaryColor}
                    accentColor={appletAccentColor}
                />
                <div>{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
            </button>
            <div
                className="overflow-hidden transition-[height] duration-500 ease-in-out rounded-lg"
                style={{
                    height: expanded ? contentRef.current?.scrollHeight || "auto" : 0,
                }}
            >
                <div ref={contentRef} className="p-4 pb-6 dark:border-gray-700">
                    <FieldsWithLabels
                        fields={fields}
                        sourceId={appletId}
                        isMobile={isMobile}
                        source={source}
                        wrapperClassName=""
                        showLabels={true}
                        showHelpText={true}
                        showRequired={true}
                        labelPosition="top"
                        labelClassName=""
                    />
                </div>
            </div>
        </div>
    );
};

export default VerticalSearchGroup;
