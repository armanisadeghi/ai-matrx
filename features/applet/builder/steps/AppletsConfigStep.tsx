"use client";

import React, { useEffect, useState } from "react";
import { PlusIcon, BookOpenIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RootState } from "@/lib/redux/store";
import {
  startNewApplet,
  setActiveApplet,
} from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import {
  fetchAppletsThunk,
  saveAppletThunk,
  addAppletToAppThunk,
  setActiveAppletWithFetchThunk,
} from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { fetchAppletsForAppThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import {
  selectActiveAppletId,
  selectAppletLoading,
  selectAllApplets,
  selectIsActiveAppletDirty,
  selectAppletsByAppId,
  selectAppletsExcludingAppId,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import AppletFormComponent from "@/features/applet/builder/modules/smart-parts/applets/AppletFormComponent";
import AppletSelectorOverlay from "@/features/applet/builder/modules/smart-parts/applets/AppletSelectorOverlay";
import SmartAppletListWrapper from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletListWrapper";
import { CustomAppletConfig } from "@/types/customAppTypes";
import { v4 as uuidv4 } from "uuid";
import AppInfoCard from "@/features/applet/builder/previews/AppInfoCard";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import useAppBuilderErrors from "@/lib/redux/app-builder/hooks/useAppBuilderErrors";
import { BrokerMapping, AppletSourceConfig } from "@/types/customAppTypes";

interface AppletsConfigStepProps {
  appId?: string; // Optional appId to filter applets
  onUpdateCompletion?: (completion: {
    isComplete: boolean;
    canProceed: boolean;
    message?: string;
    footerButtons?: React.ReactNode;
  }) => void;
}

export const AppletsConfigStep: React.FC<AppletsConfigStepProps> = ({
  appId,
  onUpdateCompletion,
}) => {
  const [currentMode, setCurrentMode] = useState<
    "initializing" | "initialized" | "new" | "existing"
  >("initializing");
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const activeAppletId = useAppSelector(selectActiveAppletId);
  const appletLoading = useAppSelector(selectAppletLoading);
  const appletsAlreadyInApp = useAppSelector((state: RootState) =>
    selectAppletsByAppId(state, appId || ""),
  );
  const appletsNotInApp = useAppSelector((state: RootState) =>
    selectAppletsExcludingAppId(state, appId || ""),
  );
  const availableApplets = useAppSelector(selectAllApplets);
  const isDirty = useAppSelector(selectIsActiveAppletDirty);
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);

  useAppBuilderErrors();

  useEffect(() => {
    if (initialFetchComplete) return;
    const fetchApplets = async () => {
      try {
        await dispatch(fetchAppletsThunk()).unwrap();
        setCurrentMode("initialized");
        setInitialFetchComplete(true);
      } catch (error) {
        setCurrentMode("initialized");
        toast({
          title: "Error",
          description: "Failed to fetch applets.",
          variant: "destructive",
        });
      }
    };
    fetchApplets();
  }, [initialFetchComplete]);

  // Effect to track completion status and update parent
  useEffect(() => {
    // Validation: At least one applet is required to proceed
    const hasApplets = appletsAlreadyInApp.length > 0;
    // Only allow proceeding if there's at least one applet and no unsaved changes
    const canProceed = hasApplets && !isDirty;

    let message = "";
    if (!hasApplets) {
      message =
        "Choose at least one existing applet or create a new one to continue";
    } else if (isDirty) {
      message = "Please save your applet changes before continuing";
    } else {
      message = `Ready to proceed with ${appletsAlreadyInApp.length} applet${appletsAlreadyInApp.length === 1 ? "" : "s"}`;
    }

    // Determine which buttons to show in the footer
    let footerButtons;

    if (!hasApplets) {
      // Show Create New button when no applets exist
      footerButtons = (
        <Button
          onClick={handleCreateNewApplet}
          className="border-emerald-500 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          variant="outline"
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Create New Applet
        </Button>
      );
    } else if (isDirty && activeAppletId) {
      // Show Save button when there are unsaved changes
      footerButtons = (
        <Button
          onClick={handleSaveApplet}
          className="border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          variant="outline"
        >
          <SaveIcon className="w-4 h-4 mr-1" />
          Save Applet
        </Button>
      );
    }

    // Report status to parent component
    onUpdateCompletion?.({
      isComplete: hasApplets,
      canProceed,
      message,
      footerButtons,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appletsAlreadyInApp.length, isDirty, activeAppletId]);

  // Handlers
  const handleCreateNewApplet = () => {
    const appletId = uuidv4();
    dispatch(startNewApplet({ id: appletId }));
    setCurrentMode("new");
  };

  const handleSaveApplet = () => {
    if (activeAppletId) {
      dispatch(saveAppletThunk(activeAppletId))
        .unwrap()
        .then((savedApplet) => {
          toast({
            title: "Success",
            description: `Applet "${savedApplet.name}" saved successfully.`,
          });

          // If this applet should be associated with an app, make sure it is
          if (appId && (!savedApplet.appId || savedApplet.appId !== appId)) {
            dispatch(
              addAppletToAppThunk({ appletId: savedApplet.id, appId }),
            ).unwrap();
          }

          // Refresh the applet list
          if (appId) {
            dispatch(fetchAppletsForAppThunk(appId))
              .unwrap()
              .catch((error) =>
                console.error("Failed to refresh applets:", error),
              );
          } else {
            dispatch(fetchAppletsThunk())
              .unwrap()
              .catch((error) =>
                console.error("Failed to refresh applets:", error),
              );
          }
        })
        .catch((error) => {
          toast({
            title: "Error",
            description:
              typeof error === "string" ? error : "Failed to save applet.",
            variant: "destructive",
          });
        });
    }
  };

  const handleAppletSelect = (applet: CustomAppletConfig) => {
    if (appId && applet.id) {
      setCurrentMode("existing");
      console.warn(
        "There is a critical feature missing here. See comments in the code.",
      );
      // TODO: We need to render a modal if the applet they've selected is associated with another app.
      // We need to tell them that an applet can only be associated with one app.
      // Offer two options: Continue with the applet association, or Duplicate the applet. (We have a service for this already, I think.)
      dispatch(addAppletToAppThunk({ appletId: applet.id, appId }))
        .unwrap()
        .then(async () => {
          // Set selected applet as active
          dispatch(setActiveApplet(applet.id));

          // Refresh applet list
          dispatch(fetchAppletsForAppThunk(appId));

          toast({
            title: "Success",
            description: `Added "${applet.name}" to this app.`,
          });
        })
        .catch((error) => {
          toast({
            title: "Error",
            description: "Failed to add the applet to this app.",
            variant: "destructive",
          });
        });
    } else if (applet.id) {
      // Just set as active if no app context
      dispatch(setActiveAppletWithFetchThunk(applet.id))
        .unwrap()
        .catch((error) => {
          toast({
            title: "Error",
            description: "Failed to set active applet.",
            variant: "destructive",
          });
        });
    }
  };

  const handleAppletRefreshComplete = () => {
    // Refresh applets for the current context
    if (appId) {
      dispatch(fetchAppletsForAppThunk(appId))
        .unwrap()
        .catch((error) => console.error("Failed to refresh applets:", error));
    } else {
      dispatch(fetchAppletsThunk())
        .unwrap()
        .catch((error) => console.error("Failed to refresh applets:", error));
    }
  };

  const handleAppletHasBeenRemoved = () => {
    setCurrentMode("initialized");
  };

  const isCreateMode = currentMode === "new";
  const isEditMode = currentMode === "existing";
  const showAppletForm = isEditMode || isCreateMode;

  const handleSourceConfigSelected = (sourceConfig: AppletSourceConfig) => {
    console.log("sourceConfig", sourceConfig);
  };

  const handleMappingCreated = (mapping: BrokerMapping) => {
    console.log("mapping", mapping);
  };

  return (
    <div className="w-full">
      <Card className="bg-white dark:bg-slate-900 overflow-hidden p-0 rounded-3xl border border-rose-200 dark:border-rose-600">
        <CardHeader className="bg-gray-100 dark:bg-gray-700 border-b border-rose-200 dark:border-rose-600 p-3 rounded-t-3xl">
          <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-center">
            <div className="flex flex-col gap-1">
              <h2 className="text-rose-500 font-medium text-lg">
                Applets Configuration
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Applets give you 'buckets' where you can add Recipes, Agents,
                and Workflows.
              </p>
            </div>
            {/* Metrics Badge */}
            <div className="flex flex-1 items-end justify-end space-x-3">
              <Badge
                variant="outline"
                className="text-base py-1 px-2.5 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-900/10"
              >
                {appletsAlreadyInApp.length}{" "}
                {appletsAlreadyInApp.length === 1
                  ? "Applet Added"
                  : "Applets Added"}
              </Badge>
              <Badge
                variant="outline"
                className="text-base py-1 px-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700"
              >
                {appletsNotInApp.length} Available to Add
              </Badge>
            </div>
          </div>
        </CardHeader>

        {/* Main Content - 3 column layout */}
        <div className="flex flex-col md:flex-row">
          {/* Middle: Applet list - now first column */}
          <div className="w-full md:w-1/4 p-5 bg-gray-50 dark:bg-gray-800/50 border-t md:border-t-0 md:border-r border-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-gray-900 dark:text-gray-100 font-medium">
                Your Applets{" "}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({appletsAlreadyInApp.length})
                </span>
              </h3>

              {/* Action buttons */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-500 text-emerald-500"
                  onClick={handleCreateNewApplet}
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  New
                </Button>

                <AppletSelectorOverlay
                  buttonLabel="Add Existing"
                  buttonVariant="outline"
                  buttonSize="sm"
                  buttonClassName="border-emerald-500 text-emerald-500"
                  onAppletSelected={handleAppletSelect}
                  onCreateApplet={handleCreateNewApplet}
                  onRefreshComplete={handleAppletRefreshComplete}
                  shouldFetch={false}
                />
              </div>
            </div>

            {/* Applet list */}
            <div className="mt-4">
              {appletsAlreadyInApp.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  <p className="text-gray-500 dark:text-gray-400">
                    No applets added yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Create new or add existing applets
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  <SmartAppletListWrapper
                    appId={appId}
                    onSelectApplet={handleAppletSelect}
                    showCreateButton={false}
                    onRefreshComplete={handleAppletRefreshComplete}
                    initialViewMode="list"
                    shouldFetch={false}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Left side: Form or Edit area - now second column */}
          <div className="w-full md:w-1/2 p-5 border-t md:border-t-0 md:border-l border-border">
            {showAppletForm ? (
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    {/* Show dirty state if applicable */}
                    {isDirty && (
                      <Badge
                        variant="outline"
                        className="border-blue-500 text-blue-600 dark:text-blue-400"
                      >
                        Unsaved Changes
                      </Badge>
                    )}
                  </div>
                </div>
                <AppletFormComponent
                  appletId={activeAppletId ?? undefined}
                  appId={appId}
                  isNew={isCreateMode}
                  onSaveApplet={handleSaveApplet}
                  onRemoveApplet={handleAppletHasBeenRemoved}
                />
              </div>
            ) : (
              <EmptyStateCard
                title="You Have No Applets in this App"
                description="Select an existing applet from the list or create a new one to get started."
                icon={BookOpenIcon}
                buttonText="Create New Applet"
                onButtonClick={handleCreateNewApplet}
                secondaryButton={
                  <AppletSelectorOverlay
                    buttonLabel="Add Existing Applet"
                    buttonVariant="outline"
                    buttonSize="default"
                    buttonClassName="border-gray-300 dark:border-gray-600"
                    onAppletSelected={handleAppletSelect}
                    onCreateApplet={handleCreateNewApplet}
                    onRefreshComplete={handleAppletRefreshComplete}
                    shouldFetch={false}
                  />
                }
                alternateState={appletsAlreadyInApp.length > 0}
                alternateTitle={`Excellent! You have ${appletsAlreadyInApp.length} ${
                  appletsAlreadyInApp.length === 1 ? "Applet" : "Applets"
                }`}
                alternateDescription="You can select an applet from the list to edit it, or add more applets if you wish."
                alternateButtonText="Add Another Applet"
              />
            )}
          </div>

          {/* Right side: App Info Card */}
          <div className="w-full md:w-1/4 p-3">
            {appId && <AppInfoCard appId={appId} className="h-full" />}
            {!appId && (
              <div className="flex items-center justify-center h-full text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">
                    No app selected
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Select an app to view its information
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AppletsConfigStep;
