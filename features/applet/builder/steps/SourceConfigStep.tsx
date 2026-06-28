"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrainCircuit, Variable, Edit } from "lucide-react";
import AppletTabsWrapper from "@/features/applet/builder/parts/AppletTabsWrapper";
import SectionCard from "@/components/official/cards/SectionCard";
import AppletSourceSelection from "@/features/applet/builder/modules/broker-mapping/SourceSelector";
import { RecipeSelectionList } from "@/features/applet/builder/modules/recipe-source/RecipeSelectionList";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  selectAppletCompiledRecipeId,
  selectAppletsByAppId,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectAppletSourceConfig } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectIsAppletDirtyById } from "@/lib/redux/app-builder/selectors/appletSelectors";
import {
  setDataSourceConfig,
  setCompiledRecipeId,
} from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { saveAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { useFetchQuickRef } from "@/hooks/useFetchQuickRef";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import { Button } from "@/components/ui/button";
import { AppletBuilder } from "@/lib/redux/app-builder/types";
import RecipeDetailsCard from "@/features/applet/builder/modules/broker-mapping/RecipeDetailsCard";
import { useToast } from "@/components/ui/use-toast";
import { AppletSourceConfig } from "@/types/customAppTypes";

const EMPTY_APPLETS: AppletBuilder[] = [];

interface SourceConfigContentProps {
  appletId: string;
  appId?: string;
  onUpdateCompletion?: (completion: {
    isComplete: boolean;
    canProceed: boolean;
    message?: string;
    footerButtons?: React.ReactNode;
  }) => void;
}

// This is the inner content component that will be wrapped
const SourceConfigContent: React.FC<SourceConfigContentProps> = ({
  appletId,
  appId,
  onUpdateCompletion,
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const appletCompiledRecipeId = useAppSelector((state: RootState) =>
    selectAppletCompiledRecipeId(state, appletId || ""),
  );
  const sourceConfigs = useAppSelector((state) =>
    appletId ? selectAppletSourceConfig(state, appletId) : null,
  );
  const isAppletDirty = useAppSelector((state) =>
    appletId ? selectIsAppletDirtyById(state, appletId) : false,
  );
  const allApplets = useAppSelector((state) =>
    appId ? selectAppletsByAppId(state, appId) : EMPTY_APPLETS,
  ) as AppletBuilder[];

  const [activeSourceType, setActiveSourceType] = useState<string | null>(
    sourceConfigs?.sourceType || null,
  );

  const [editingRecipe, setEditingRecipe] = useState<boolean>(
    !sourceConfigs || !sourceConfigs.config || !sourceConfigs.config.id,
  );

  const isFirstRender = useRef(true);
  const lastUpdateTimeRef = useRef(0);

  const {
    quickReferenceRecords,
    quickReferenceKeyDisplayPairs,
    loadingState,
    getRecordIdByRecord,
  } = useFetchQuickRef("recipe");
  const quickRefCount = quickReferenceRecords.length;

  const handleSourceTypeSelected = (sourceType: string) => {
    setActiveSourceType(sourceType);
    setEditingRecipe(true);
  };

  const handleRecipeCompiledIdSelected = (compiledId: string) => {
    if (appletId) {
      dispatch(
        setCompiledRecipeId({ id: appletId, compiledRecipeId: compiledId }),
      );
    }
  };

  const handleSourceConfigSelected = (
    sourceConfig: AppletSourceConfig | null,
  ) => {
    if (sourceConfig && appletId) {
      dispatch(
        setDataSourceConfig({ id: appletId, dataSourceConfig: sourceConfig }),
      );
      // Don't automatically exit editing mode - wait for user confirmation
      updateCompletionStatus();
    }
  };

  const handleEditRecipe = () => {
    // Explicit user action to edit recipe
    setEditingRecipe(true);
  };

  // Handler to save the current applet
  const handleSaveApplet = useCallback(async () => {
    if (appletId) {
      try {
        await dispatch(saveAppletThunk(appletId)).unwrap();
        toast({
          title: "Success",
          description: "Applet saved successfully",
        });
        updateCompletionStatus();
      } catch (error) {
        console.error("Failed to save applet:", error);
        toast({
          title: "Error",
          description: "Failed to save applet",
          variant: "destructive",
        });
      }
    }
  }, [appletId, dispatch, toast]);

  // Handler to save all applets
  const handleSaveAllApplets = useCallback(async () => {
    if (!appId || allApplets.length === 0) return;

    try {
      // Save all applets that have source configs and are dirty
      const savePromises = allApplets
        .filter((applet) => {
          const configs = selectAppletSourceConfig(
            {
              appletBuilder: { applets: { [applet.id]: applet } },
            } as RootState,
            applet.id,
          );
          const isDirty = selectIsAppletDirtyById(
            {
              appletBuilder: { applets: { [applet.id]: applet } },
            } as RootState,
            applet.id,
          );
          return configs && isDirty;
        })
        .map((applet) => dispatch(saveAppletThunk(applet.id)).unwrap());

      if (savePromises.length > 0) {
        await Promise.all(savePromises);
        toast({
          title: "Success",
          description: "All applets saved successfully",
        });
      }

      updateCompletionStatus();
    } catch (error) {
      console.error("Failed to save applets:", error);
      toast({
        title: "Error",
        description: "Failed to save one or more applets",
        variant: "destructive",
      });
    }
  }, [appId, allApplets, dispatch, toast]);

  const updateCompletionStatus = useCallback(() => {
    if (!onUpdateCompletion || !appId) return;

    // Throttle updates to prevent excessive re-renders
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 200) return;
    lastUpdateTimeRef.current = now;

    // Check if all applets have source configs
    const appletstWithSourceConfigs = allApplets.filter((applet) => {
      const configs = selectAppletSourceConfig(
        { appletBuilder: { applets: { [applet.id]: applet } } } as RootState,
        applet.id,
      );
      return configs;
    });

    // Check if any applets are dirty (need saving)
    const dirtyApplets = allApplets.filter((applet) =>
      selectIsAppletDirtyById(
        { appletBuilder: { applets: { [applet.id]: applet } } } as RootState,
        applet.id,
      ),
    );

    const allHaveSourceConfigs =
      allApplets.length > 0 &&
      appletstWithSourceConfigs.length === allApplets.length;
    const anyNeedSaving = dirtyApplets.length > 0;

    // Create save button if any applets need saving
    const saveButton = anyNeedSaving ? (
      <Button
        onClick={handleSaveAllApplets}
        className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
      >
        Save All Changes
      </Button>
    ) : null;

    onUpdateCompletion({
      isComplete: allHaveSourceConfigs && !anyNeedSaving,
      canProceed: allHaveSourceConfigs, // They can proceed if all have configs, even if not saved
      message:
        allApplets.length === 0
          ? "No applets found. Please create applets first."
          : !allHaveSourceConfigs
            ? `${appletstWithSourceConfigs.length}/${allApplets.length} applets have source configurations.`
            : anyNeedSaving
              ? "All applets have sources. Please save your changes."
              : "All applets have been configured and saved.",
      footerButtons: saveButton,
    });
  }, [allApplets, appId, handleSaveAllApplets, onUpdateCompletion]);

  // Only update completion on initial render and when explicitly called
  useEffect(() => {
    if (isFirstRender.current) {
      updateCompletionStatus();
      isFirstRender.current = false;
    }
  }, []);

  // Only update completion when source config or dirty state changes
  // Don't make any automatic UI changes
  useEffect(() => {
    updateCompletionStatus();
  }, [sourceConfigs, isAppletDirty, updateCompletionStatus]);

  const itemCounts = {
    recipe: quickRefCount,
    "ai-agent": quickRefCount,
    action: 0,
    "api-integration": 0,
  };

  // Handler for when recipe configuration is complete
  const handleRecipeConfigComplete = () => {
    // Only switch to summary view when the user explicitly completes the recipe selection
    setEditingRecipe(false);
    updateCompletionStatus();
  };

  const renderRecipeSelection = () => {
    if (!editingRecipe && sourceConfigs) {
      // Show the recipe details and edit button when a recipe is selected
      return (
        <div className="space-y-4">
          <RecipeDetailsCard
            sourceConfig={sourceConfigs}
            appletId={appletId}
            onChangeRecipe={handleEditRecipe}
          />
        </div>
      );
    }

    // Show the recipe selection UI when in editing mode
    return (
      <SectionCard title="Select an AI Recipe" color="gray">
        <div className="flex flex-col items-center justify-center py-6 text-center px-4">
          <RecipeSelectionList
            setCompiledRecipeId={handleRecipeCompiledIdSelected}
            setRecipeSourceConfig={handleSourceConfigSelected}
            initialSourceConfig={sourceConfigs}
            versionDisplay="card"
            onConfirm={handleRecipeConfigComplete}
          />
        </div>
      </SectionCard>
    );
  };

  return (
    <div className="space-y-4">
      <AppletSourceSelection
        onSelect={handleSourceTypeSelected}
        itemCounts={itemCounts}
        activeSourceType={activeSourceType}
      />

      <div className="w-full gap-4">
        <div className="space-y-4">
          {activeSourceType === "recipe" ? (
            renderRecipeSelection()
          ) : (
            <SectionCard title="Intelligence Source Selection" color="gray">
              <EmptyStateCard
                title="Select an Intelligence Source"
                description={`${itemCounts["ai-agent"]} Agents, ${itemCounts["action"]} Actions, ${itemCounts["api-integration"]} API Integrations, ${itemCounts["recipe"]} Recipes`}
                icon={BrainCircuit}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
};

// This is the main wrapper component that uses AppletTabsWrapper
interface SourceConfigStepProps {
  appId?: string;
  onUpdateCompletion?: (completion: {
    isComplete: boolean;
    canProceed: boolean;
    message?: string;
    footerButtons?: React.ReactNode;
  }) => void;
  onCreateNewApplet?: () => void;
}

export const SourceConfigStep: React.FC<SourceConfigStepProps> = ({
  appId,
  onUpdateCompletion,
  onCreateNewApplet,
}) => {
  return (
    <AppletTabsWrapper
      appId={appId}
      title="Connect Applets to Intelligence"
      description="Time to make real-life magic happen! Select a source for each applet."
      onCreateNewApplet={onCreateNewApplet}
    >
      {(applet) => (
        <SourceConfigContent
          appletId={applet.id}
          appId={appId}
          onUpdateCompletion={onUpdateCompletion}
        />
      )}
    </AppletTabsWrapper>
  );
};

export default SourceConfigStep;
