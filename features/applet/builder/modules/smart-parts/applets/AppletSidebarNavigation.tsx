"use client";

import React, { useEffect, useRef } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppletsByAppId, selectActiveAppletId } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectActiveContainerId, selectAllContainerIds } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { setActiveApplet } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { setActiveAppletWithFetchThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { setActiveContainer } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import { setActiveContainerWithFetchThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import GroupSelectorOverlay from "../containers/GroupSelectorOverlay";
import { PlusCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { ComponentGroup } from "@/types/customAppTypes";
import { fetchContainerByIdThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { saveContainerAndUpdateAppletThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { recompileAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { saveAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { selectAppById } from "@/lib/redux/app-builder/selectors/appSelectors";
import SectionCard from "@/components/official/cards/SectionCard";

interface AppletSidebarNavigationProps {
    appId: string;
    title?: string;
    onSelectContainer?: (appletId: string, containerId: string) => void;
    onAddContainer?: (appletId: string) => void;
}

const AppletSidebarNavigation: React.FC<AppletSidebarNavigationProps> = ({
    appId,
    title = "Navigation",
    onSelectContainer,
    onAddContainer,
}) => {
    const dispatch = useAppDispatch();
    const initialSelectionMade = useRef(false);

    // Redux state
    const applets = useAppSelector((state) => selectAppletsByAppId(state, appId));
    const app = useAppSelector((state) => selectAppById(state, appId));
    const activeAppletId = useAppSelector(selectActiveAppletId);
    const activeContainerId = useAppSelector(selectActiveContainerId);
    const allContainerIds = useAppSelector(selectAllContainerIds);

    // Auto-select first container on initial render
    useEffect(() => {
        if (applets.length > 0 && !initialSelectionMade.current) {
            initialSelectionMade.current = true;
            const firstApplet = applets[0];
            if (firstApplet?.containers && firstApplet.containers.length > 0) {
                const firstContainer = firstApplet.containers[0];
                handleGroupChange(firstApplet.id, firstContainer.id);
            } else if (firstApplet?.id) {
                dispatch(setActiveAppletWithFetchThunk(firstApplet.id)).unwrap()
                    .catch(error => {
                        console.error("Failed to set active applet:", error);
                        toast({
                            title: "Error",
                            description: "Failed to set active applet.",
                            variant: "destructive",
                        });
                    });
            }
        }
    }, [applets, dispatch]);

    const handleExistingContainerSelect = async (group: ComponentGroup) => {
        if (!activeAppletId) {
            toast({
                title: "Select an applet",
                description: "Choose an applet before adding a container.",
                variant: "destructive",
            });
            return;
        }
        const containerExists = allContainerIds.includes(group.id);

        try {
            // Fetch the container if it's not in state
            if (!containerExists) {
                await dispatch(fetchContainerByIdThunk(group.id)).unwrap();
            }

            // First select the container so the form updates
            dispatch(setActiveContainerWithFetchThunk(group.id));

            // Add the container to the applet using the thunk that handles database updates
            await dispatch(
                saveContainerAndUpdateAppletThunk({
                    containerId: group.id,
                    appletId: activeAppletId,
                })
            ).unwrap();

            // After successfully adding the container to the applet in the database,
            // save and recompile the applet to ensure everything is in sync
            await dispatch(saveAppletThunk(activeAppletId)).unwrap();
        
            // After saving, recompile the applet to ensure all container relationships are updated
            await dispatch(recompileAppletThunk(activeAppletId)).unwrap();

            toast({
                title: "Success",
                description: "Group added to applet successfully.",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: typeof error === "string" ? error : "Failed to add group to applet.",
                variant: "destructive",
            });
        }
    };

    const handleAppletChange = (value: string) => {
        dispatch(setActiveAppletWithFetchThunk(value)).unwrap()
            .catch(error => {
                console.error("Failed to set active applet:", error);
                toast({
                    title: "Error",
                    description: "Failed to set active applet.",
                    variant: "destructive",
                });
            });

        // When changing applet, clear the active container
        dispatch(setActiveContainer(null));
    };

    const handleGroupChange = async (appletId: string, containerId: string) => {
        // Check if container exists in state
        const containerExists = allContainerIds.includes(containerId);

        try {
            // Make sure the applet is set as active
            dispatch(setActiveAppletWithFetchThunk(appletId)).unwrap()
                .catch(error => {
                    console.error("Failed to set active applet:", error);
                    toast({
                        title: "Error",
                        description: "Failed to set active applet.",
                        variant: "destructive",
                    });
                });

            // Fetch the container if it's not in state
            if (!containerExists) {
                await dispatch(fetchContainerByIdThunk(containerId)).unwrap();
            }

            // Set the active container
            dispatch(setActiveContainerWithFetchThunk(containerId));

            // Notify parent component if callback provided
            if (onSelectContainer) {
                onSelectContainer(appletId, containerId);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: typeof error === "string" ? error : "Failed to load container.",
                variant: "destructive",
            });
        }
    };

    const handleAddContainer = (appletId: string) => {
        if (onAddContainer) {
            onAddContainer(appletId);
        }
    };

    if (!app) {
        return <div className="p-3 text-sm text-destructive">The selected app is unavailable.</div>;
    }

    return (
        <SectionCard
            title={app.name}
            description={title}
        >
            <div className="flex-grow overflow-y-auto">
                <Accordion type="single" collapsible className="w-full" defaultValue={activeAppletId || undefined}>
                    {applets.map((applet) => (
                        <AccordionItem key={applet.id} value={applet.id}>
                            <AccordionTrigger
                                onClick={() => handleAppletChange(applet.id)}
                                className={`px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 border-none ${
                                    activeAppletId === applet.id
                                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                        : "text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-900"
                                }`}
                            >
                                {applet.name}
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="pl-4">
                                    {applet.containers?.map((container) => (
                                        <button
                                            key={container.id}
                                            onClick={() => handleGroupChange(applet.id, container.id)}
                                            className={`w-full text-left px-2 py-1.5 text-sm rounded-md my-1 border-none ${
                                                activeContainerId === container.id && activeAppletId === applet.id
                                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                            }`}
                                        >
                                            {container.label}
                                        </button>
                                    ))}

                                    {/* Add Container Option */}
                                    <div className="mt-2">
                                        <GroupSelectorOverlay
                                            triggerComponent={
                                                <button className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md my-1 border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                                                    <span>Add another existing container</span>
                                                    <PlusCircle className="h-4 w-4" />
                                                </button>
                                            }
                                            onGroupSelected={(group) => handleExistingContainerSelect(group)}
                                            onCreateGroup={() => handleAddContainer(applet.id)}
                                            buttonVariant="ghost"
                                            dialogTitle={`Add Container to ${applet.name}`}
                                        />
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </SectionCard>
    );
};

export default AppletSidebarNavigation;
